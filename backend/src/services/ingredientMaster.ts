import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/dynamo.js";
import { newId } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { normalizeIngredientName } from "../lib/normalize.js";
import type { Ingredient } from "../types/index.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

/**
 * 食材マスターのインメモリキャッシュ(Lambda実行コンテキストが温まっている間だけ有効)。
 * 5人規模・食材種別も高々数百件程度の想定のため全件ロードで十分だが、
 * ウォームスタートのたびに毎回全件スキャンするのは無駄なのでTTLキャッシュする
 * (将来件数が増えた場合はGSI3を直接引くクエリに切り替える)。
 */
let cache: { items: Ingredient[]; expiresAt: number } | null = null;

/**
 * テスト専用: モジュールスコープのキャッシュをリセットする。
 * DynamoDBをフェイクに差し替える統合テストでは、テストケースをまたいで
 * このキャッシュが残ると「前のテストで作った食材が別テストにも見える」という
 * 意図しない依存が発生するため、各テストの beforeEach から呼び出すこと。
 */
export function __resetIngredientCacheForTests(): void {
  cache = null;
}

async function loadAllIngredients(): Promise<Ingredient[]> {
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

/**
 * AIやユーザー入力から渡された食材名(表記ゆれあり)を正規化されたIngredientIdへ解決する。
 * 既存のマスターに一致するものがなければ新規作成する。
 */
export async function resolveIngredientId(
  rawName: string,
  categoryHint = "other",
): Promise<{ ingredientId: string; name: string; category: string }> {
  const normalized = normalizeIngredientName(rawName);
  const all = await loadAllIngredients();

  for (const ing of all) {
    if (normalizeIngredientName(ing.name) === normalized) {
      return { ingredientId: ing.id, name: ing.name, category: ing.category };
    }
    if (ing.aliases.some((a) => normalizeIngredientName(a) === normalized)) {
      return { ingredientId: ing.id, name: ing.name, category: ing.category };
    }
  }

  // 未知の食材名 -> マスターへ新規登録
  const id = `ingredient_${newId()}`;
  const now = new Date().toISOString();
  const item: Ingredient = {
    entityType: "Ingredient",
    id,
    name: rawName,
    category: categoryHint,
    aliases: [rawName],
    createdAt: now,
  };
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
  // TTL切れを待たず、同一ウォームコンテナ内の後続呼び出しがすぐ見つけられるようにする。
  cache?.items.push(item);
  return { ingredientId: id, name: rawName, category: categoryHint };
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
