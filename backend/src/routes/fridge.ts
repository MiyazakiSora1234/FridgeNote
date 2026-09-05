import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import {
  ConsumeRequestSchema,
  CreateFridgeItemRequestSchema,
  UpdateFridgeItemRequestSchema,
} from "../schemas/apiSchemas.js";
import { ValidationError } from "../lib/errors.js";
import {
  consumeIngredients,
  createFridgeItem,
  deleteFridgeItem,
  listFridgeItems,
  updateFridgeItem,
} from "../services/fridgeService.js";
import { getAnalysis } from "../services/analysisService.js";

export const fridgeRoute = new Hono<AppEnv>();

fridgeRoute.get("/items", async (c) => {
  const userId = c.get("userId");
  const items = await listFridgeItems(userId);
  return c.json({ items }, 200);
});

fridgeRoute.post("/items", async (c) => {
  const body = CreateFridgeItemRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw ValidationError(body.error.message);

  const userId = c.get("userId");
  const source = body.data.sourceAnalysisId ? "image_food" : "manual";
  const item = await createFridgeItem(userId, {
    ingredientName: body.data.ingredientName,
    quantity: body.data.quantity,
    unit: body.data.unit,
    expiresAt: body.data.expiresAt ?? null,
    source,
  });
  return c.json(item, 201);
});

fridgeRoute.patch("/items/:id", async (c) => {
  const body = UpdateFridgeItemRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw ValidationError(body.error.message);

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
  if (!body.success) throw ValidationError(body.error.message);

  const userId = c.get("userId");
  // sourceAnalysisIdの所有者チェックを兼ねて取得(他人の解析結果からは消費できない)
  const analysis = await getAnalysis(userId, body.data.sourceAnalysisId);
  const dishName =
    analysis.result && analysis.result.kind === "dish" ? analysis.result.dish : "unknown";

  const result = await consumeIngredients(
    userId,
    body.data.sourceAnalysisId,
    dishName,
    body.data.consumedIngredients,
  );
  return c.json(result, 200);
});
