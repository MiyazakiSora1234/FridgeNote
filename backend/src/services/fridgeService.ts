import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { NotFoundError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { resolveIngredientId } from "./ingredientMaster.js";
import type { ExpiryStatus, FridgeItem, RecipeAnalysis } from "../types/index.js";

const DAYS_SOON_THRESHOLD = 3;

export function computeExpiryStatus(expiresAt: string | null, now = new Date()): ExpiryStatus {
  if (!expiresAt) return "none";
  const diffMs = new Date(`${expiresAt}T00:00:00`).getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= DAYS_SOON_THRESHOLD) return "soon";
  return "ok";
}

async function queryFridgeItems(userId: string): Promise<FridgeItem[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: { ":pk": Keys.user(userId), ":skPrefix": Keys.itemPrefix() },
    }),
  );
  return (res.Items ?? []) as FridgeItem[];
}

export async function listFridgeItems(
  userId: string,
): Promise<Array<FridgeItem & { expiryStatus: ExpiryStatus }>> {
  const items = await queryFridgeItems(userId);
  return items
    .map((item) => ({ ...item, expiryStatus: computeExpiryStatus(item.expiresAt) }))
    .sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt.localeCompare(b.expiresAt);
    });
}

export async function createFridgeItem(
  userId: string,
  input: {
    ingredientName: string;
    quantity: number;
    unit: string;
    expiresAt?: string | null;
    source?: FridgeItem["source"];
  },
): Promise<FridgeItem> {
  const { ingredientId, name, category } = await resolveIngredientId(input.ingredientName);
  const now = new Date().toISOString();
  const itemId = newId();
  const item: FridgeItem = {
    entityType: "FridgeItem",
    userId,
    itemId,
    ingredientId,
    name,
    category,
    quantity: input.quantity,
    unit: input.unit,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
    source: input.source ?? "manual",
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: Keys.user(userId),
        SK: Keys.item(itemId),
        GSI1PK: Keys.user(userId),
        GSI1SK: Keys.expires(item.expiresAt),
        ...item,
      },
    }),
  );
  return item;
}

export async function updateFridgeItem(
  userId: string,
  itemId: string,
  patch: { quantity?: number; unit?: string; expiresAt?: string | null },
): Promise<FridgeItem> {
  const sets: string[] = ["updatedAt = :updatedAt"];
  const values: Record<string, unknown> = { ":updatedAt": new Date().toISOString() };

  if (patch.quantity !== undefined) {
    sets.push("quantity = :quantity");
    values[":quantity"] = patch.quantity;
  }
  if (patch.unit !== undefined) {
    sets.push("unit = :unit");
    values[":unit"] = patch.unit;
  }
  if (patch.expiresAt !== undefined) {
    sets.push("expiresAt = :expiresAt", "GSI1SK = :gsi1sk");
    values[":expiresAt"] = patch.expiresAt;
    values[":gsi1sk"] = Keys.expires(patch.expiresAt);
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: Keys.user(userId), SK: Keys.item(itemId) },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes as FridgeItem;
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw NotFoundError("fridge item not found");
    throw err;
  }
}

export async function deleteFridgeItem(userId: string, itemId: string): Promise<void> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: Keys.user(userId), SK: Keys.item(itemId) },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  } catch (err) {
    if (isConditionalCheckFailed(err)) throw NotFoundError("fridge item not found");
    throw err;
  }
}

export interface ConsumeResult {
  consumed: Array<{ ingredientId: string; newQuantity: number }>;
  skipped: Array<{ ingredientId: string; reason: string }>;
}

/**
 * 料理写真解析でユーザーが確定した「使用食材」を在庫から減算する。
 * 在庫が0以下になった場合は削除せずquantity=0として保持する(要件通り)。
 * 各食材の在庫更新は別々のDynamoDBアイテムに対する独立した書き込みなので並列実行する。
 */
export async function consumeIngredients(
  userId: string,
  sourceAnalysisId: string,
  dishName: string,
  consumedIngredients: Array<{ ingredientId: string; quantity: number; unit: string }>,
): Promise<ConsumeResult> {
  const allItems = await queryFridgeItems(userId);

  // 各食材の更新は独立したDynamoDBアイテムへの書き込みなので並列実行するが、
  // 結果配列は consumedIngredients の入力順を保つため、push ではなく
  // 各タスクの戻り値を Promise.all 後に順序通り組み立てる。
  type Outcome =
    | { kind: "consumed"; ingredientId: string; newQuantity: number; name: string; quantity: number; unit: string }
    | { kind: "skipped"; ingredientId: string; reason: string };

  const outcomes: Outcome[] = await Promise.all(
    consumedIngredients.map(async (consume): Promise<Outcome> => {
      const match = allItems.find((i) => i.ingredientId === consume.ingredientId);
      if (!match) {
        return { kind: "skipped", ingredientId: consume.ingredientId, reason: "not_in_fridge" };
      }
      const newQuantity = Math.max(0, match.quantity - consume.quantity);
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: Keys.user(userId), SK: Keys.item(match.itemId) },
          UpdateExpression: "SET quantity = :q, updatedAt = :u",
          ExpressionAttributeValues: { ":q": newQuantity, ":u": new Date().toISOString() },
        }),
      );
      return {
        kind: "consumed",
        ingredientId: consume.ingredientId,
        newQuantity,
        name: match.name,
        quantity: consume.quantity,
        unit: consume.unit,
      };
    }),
  );

  const result: ConsumeResult = { consumed: [], skipped: [] };
  const recipeIngredients: RecipeAnalysis["ingredients"] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "skipped") {
      result.skipped.push({ ingredientId: outcome.ingredientId, reason: outcome.reason });
      recipeIngredients.push({
        ingredientId: outcome.ingredientId,
        name: outcome.ingredientId,
        confidence: 1,
        consumed: false,
      });
    } else {
      result.consumed.push({ ingredientId: outcome.ingredientId, newQuantity: outcome.newQuantity });
      recipeIngredients.push({
        ingredientId: outcome.ingredientId,
        name: outcome.name,
        confidence: 1,
        consumed: true,
        consumedQuantity: outcome.quantity,
        unit: outcome.unit,
      });
    }
  }

  const recipe: RecipeAnalysis = {
    entityType: "RecipeAnalysis",
    userId,
    analysisId: sourceAnalysisId,
    dishName,
    ingredients: recipeIngredients,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: Keys.user(userId),
        SK: Keys.recipe(sourceAnalysisId),
        ...recipe,
      },
    }),
  );

  return result;
}
