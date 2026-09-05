import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/dynamo.js";
import { NotFoundError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
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

export async function listFridgeItems(
  userId: string,
): Promise<Array<FridgeItem & { expiryStatus: ExpiryStatus }>> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":skPrefix": "ITEM#" },
    }),
  );
  const items = (res.Items ?? []) as FridgeItem[];
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
        PK: `USER#${userId}`,
        SK: `ITEM#${itemId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `EXPIRES#${item.expiresAt ?? "9999-99-99"}`,
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
    values[":gsi1sk"] = `EXPIRES#${patch.expiresAt ?? "9999-99-99"}`;
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes as FridgeItem;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      throw NotFoundError("fridge item not found");
    }
    throw err;
  }
}

export async function deleteFridgeItem(userId: string, itemId: string): Promise<void> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      throw NotFoundError("fridge item not found");
    }
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
 */
export async function consumeIngredients(
  userId: string,
  sourceAnalysisId: string,
  dishName: string,
  consumedIngredients: Array<{ ingredientId: string; quantity: number; unit: string }>,
): Promise<ConsumeResult> {
  const allItems = await ddb
    .send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":skPrefix": "ITEM#" },
      }),
    )
    .then((res) => (res.Items ?? []) as FridgeItem[]);

  const result: ConsumeResult = { consumed: [], skipped: [] };
  const recipeIngredients: RecipeAnalysis["ingredients"] = [];

  for (const consume of consumedIngredients) {
    const match = allItems.find((i) => i.ingredientId === consume.ingredientId);
    if (!match) {
      result.skipped.push({ ingredientId: consume.ingredientId, reason: "not_in_fridge" });
      recipeIngredients.push({
        ingredientId: consume.ingredientId,
        name: consume.ingredientId,
        confidence: 1,
        consumed: false,
      });
      continue;
    }
    const newQuantity = Math.max(0, match.quantity - consume.quantity);
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `ITEM#${match.itemId}` },
        UpdateExpression: "SET quantity = :q, updatedAt = :u",
        ExpressionAttributeValues: { ":q": newQuantity, ":u": new Date().toISOString() },
      }),
    );
    result.consumed.push({ ingredientId: consume.ingredientId, newQuantity });
    recipeIngredients.push({
      ingredientId: consume.ingredientId,
      name: match.name,
      confidence: 1,
      consumed: true,
      consumedQuantity: consume.quantity,
      unit: consume.unit,
    });
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
        PK: `USER#${userId}`,
        SK: `RECIPE#${sourceAnalysisId}`,
        ...recipe,
      },
    }),
  );

  return result;
}
