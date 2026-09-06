import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import {
  BulkCreateFridgeItemsRequestSchema,
  ConsumeRequestSchema,
  CreateFridgeItemRequestSchema,
  UpdateFridgeItemRequestSchema,
} from "../schemas/apiSchemas.js";
import { ValidationError, validationErrorFromZod } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  consumeIngredients,
  createFridgeItem,
  createFridgeItemsBulk,
  deleteFridgeItem,
  listFridgeItems,
  updateFridgeItem,
} from "../services/fridgeService.js";
import { getAnalysis, recordUserFeedback } from "../services/analysisService.js";
import { recordVoiceUserFeedback } from "../services/voiceAnalysisService.js";

export const fridgeRoute = new Hono<AppEnv>();

fridgeRoute.get("/items", async (c) => {
  const userId = c.get("userId");
  const items = await listFridgeItems(userId);
  return c.json({ items }, 200);
});

fridgeRoute.post("/items", async (c) => {
  const body = CreateFridgeItemRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  const source = body.data.sourceAnalysisId ? "image_food" : "manual";
  const item = await createFridgeItem(userId, {
    ingredientName: body.data.ingredientName,
    quantity: body.data.quantity,
    unit: body.data.unit,
    expiresAt: body.data.expiresAt ?? null,
    source,
  });

  if (body.data.sourceAnalysisId) {
    // AI認識結果に対してユーザーが最終的に確定した値を記録する(補助的な記録なので失敗は無視する)。
    await recordUserFeedback(userId, body.data.sourceAnalysisId, {
      type: "food_confirmed",
      ingredientName: body.data.ingredientName,
      quantity: body.data.quantity,
      unit: body.data.unit,
      expiresAt: body.data.expiresAt ?? null,
    }).catch((err) => logger.warn("record_user_feedback_failed_non_fatal", { err, userId, analysisId: body.data.sourceAnalysisId }));
  }

  return c.json(item, 201);
});

/**
 * レシート/音声の確認画面で「すべて追加」を押したときに呼ばれる一括登録。
 * ユーザーがチェックを外した項目はこの時点で items に含めない(=登録しない)前提で、
 * サーバー側は「渡されたものは全部登録する」だけのシンプルな責務にする。
 */
fridgeRoute.post("/items/bulk", async (c) => {
  const body = BulkCreateFridgeItemsRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  const items = await createFridgeItemsBulk(
    userId,
    body.data.items.map((item) => ({
      ingredientName: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      expiresAt: item.expiresAt ?? null,
      source: body.data.source,
    })),
  );

  if (body.data.sourceAnalysisId) {
    const feedback = {
      type: `${body.data.source}_bulk_confirmed`,
      items: body.data.items,
    };
    const recordFeedback =
      body.data.source === "voice"
        ? recordVoiceUserFeedback(userId, body.data.sourceAnalysisId, feedback)
        : recordUserFeedback(userId, body.data.sourceAnalysisId, feedback);
    await recordFeedback.catch((err) =>
      logger.warn("record_user_feedback_failed_non_fatal", { err, userId, analysisId: body.data.sourceAnalysisId }),
    );
  }

  return c.json({ items }, 201);
});

fridgeRoute.patch("/items/:id", async (c) => {
  const body = UpdateFridgeItemRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  const item = await updateFridgeItem(userId, c.req.param("id"), body.data);
  return c.json(item, 200);
});

fridgeRoute.delete("/items/:id", async (c) => {
  const userId = c.get("userId");
  await deleteFridgeItem(userId, c.req.param("id"));
  return c.body(null, 204);
});

fridgeRoute.post("/consume", async (c) => {
  const body = ConsumeRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw validationErrorFromZod(body.error);

  const userId = c.get("userId");
  // sourceAnalysisIdの所有者チェックを兼ねて取得(他人の解析結果からは消費できない)
  const analysis = await getAnalysis(userId, body.data.sourceAnalysisId);

  // 「使用した食材候補」を確認してから消費する、という機能の意図上、
  // AIが実際に提案していない食材IDを勝手に消費対象にはできないようにする。
  if (analysis.status !== "completed" || !analysis.result || analysis.result.kind !== "dish") {
    throw ValidationError("sourceAnalysisId must reference a completed dish analysis");
  }
  const candidateIngredientIds = new Set(analysis.result.ingredients.map((i) => i.ingredientId));
  const unknownIngredientIds = body.data.consumedIngredients
    .map((i) => i.ingredientId)
    .filter((id) => !candidateIngredientIds.has(id));
  if (unknownIngredientIds.length > 0) {
    throw ValidationError(
      `consumedIngredients contains ingredients the AI did not suggest for this dish: ${unknownIngredientIds.join(", ")}`,
    );
  }

  const dishName = analysis.result.dish;
  // AIが候補として提示した名前をここで拾っておき、在庫に無くskipされた食材の
  // 表示名として使う(consumeIngredients単体ではingredientIdしか持たないため)。
  const candidateNames = new Map(analysis.result.ingredients.map((i) => [i.ingredientId, i.name]));
  const result = await consumeIngredients(
    userId,
    body.data.sourceAnalysisId,
    dishName,
    body.data.consumedIngredients,
    candidateNames,
  );

  // AIが候補として出した食材のうち、ユーザーが実際に「使った」と確定したものを記録する
  // (補助的な記録なので失敗は無視する)。
  await recordUserFeedback(userId, body.data.sourceAnalysisId, {
    type: "dish_consumed",
    consumedIngredients: body.data.consumedIngredients,
  }).catch((err) => logger.warn("record_user_feedback_failed_non_fatal", { err, userId, analysisId: body.data.sourceAnalysisId }));

  return c.json(result, 200);
});
