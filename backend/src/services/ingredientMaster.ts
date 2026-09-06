import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { deterministicIdFromKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { normalizeIngredientName } from "../lib/normalize.js";
import type { Ingredient } from "../types/index.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { items: Ingredient[]; expiresAt: number } | null = null;

export function __resetIngredientCacheForTests(): void {
  cache = null;
}

export async function loadAllIngredients(): Promise<Ingredient[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.items;

  const items: Ingredient[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :pk",
        ExpressionAttributeValues: { ":pk": Keys.ingredientMasterPartition() },
        ExclusiveStartKey,
      }),
    );
    for (const raw of res.Items ?? []) items.push(raw as Ingredient);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  cache = { items, expiresAt: Date.now() + CACHE_TTL_MS };
  return items;
}

export interface IngredientIndex {
  byNormalizedName: Map<string, Ingredient>;
  byNormalizedAlias: Map<string, Ingredient>;
}

export async function loadIngredientIndex(): Promise<IngredientIndex> {
  const all = await loadAllIngredients();
  const byNormalizedName = new Map<string, Ingredient>();
  const byNormalizedAlias = new Map<string, Ingredient>();
  for (const ing of all) {
    const normalizedName = normalizeIngredientName(ing.name);
    if (!byNormalizedName.has(normalizedName)) byNormalizedName.set(normalizedName, ing);
    for (const alias of ing.aliases) {
      const normalizedAlias = normalizeIngredientName(alias);
      if (!byNormalizedAlias.has(normalizedAlias)) byNormalizedAlias.set(normalizedAlias, ing);
    }
  }
  return { byNormalizedName, byNormalizedAlias };
}

export async function resolveIngredientId(
  rawName: string,
  categoryHint = "other",
): Promise<{ ingredientId: string; name: string; category: string }> {
  const normalized = normalizeIngredientName(rawName);
  const index = await loadIngredientIndex();
  const match = index.byNormalizedName.get(normalized) ?? index.byNormalizedAlias.get(normalized);
  if (match) return { ingredientId: match.id, name: match.name, category: match.category };

  const id = `ingredient_${deterministicIdFromKey(normalized)}`;
  const now = new Date().toISOString();
  const item: Ingredient = {
    entityType: "Ingredient",
    id,
    name: rawName,
    category: categoryHint,
    aliases: [rawName],
    createdAt: now,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: Keys.ingredient(id),
          SK: Keys.ingredientMetadata(),
          GSI3PK: Keys.ingredientMasterPartition(),
          GSI3SK: Keys.ingredientName(normalized),
          ...item,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    cache?.items.push(item);
    return { ingredientId: id, name: rawName, category: categoryHint };
  } catch (err) {
    // 同じ食材名を同時に解決しようとした別リクエストが先に作成済みのケース。再取得して合わせる。
    if (!isConditionalCheckFailed(err)) throw err;
    const existing = await getIngredientById(id);
    if (existing) return { ingredientId: existing.id, name: existing.name, category: existing.category };
    throw err;
  }
}

export async function getIngredientById(ingredientId: string): Promise<Ingredient | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: Keys.ingredient(ingredientId), SK: Keys.ingredientMetadata() },
    }),
  );
  return (res.Item as Ingredient | undefined) ?? null;
}
