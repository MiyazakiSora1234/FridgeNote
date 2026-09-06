import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { deterministicIdFromKey } from "../lib/ids.js";
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

/** IngredientSearchService からも再利用するため export する。 */
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

/**
 * 食材名の完全一致・別名(alias)完全一致判定を、resolveIngredientId(このファイル)と
 * AliasIngredientSearchService(ingredientSearchService.ts)の両方が個別に線形スキャンで
 * 実装していたのを1つに統合したもの。Mapによる索引にすることで、この2つの判定が
 * O(1)になる(件数が増えてきた場合の将来のスケーラビリティにも寄与する)。
 *
 * 同じ正規化名/別名を複数の食材が偶然持つ場合(データ品質上望ましくないが起こりうる)、
 * 先に読み込んだ方を採用する(以前の線形スキャンでも配列の先頭側が優先されていた挙動と同じ)。
 */
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

/**
 * AIやユーザー入力から渡された食材名(表記ゆれあり)を正規化されたIngredientIdへ解決する。
 * 既存のマスターに一致するものがなければ新規作成する。
 */
export async function resolveIngredientId(
  rawName: string,
  categoryHint = "other",
): Promise<{ ingredientId: string; name: string; category: string }> {
  const normalized = normalizeIngredientName(rawName);
  const index = await loadIngredientIndex();
  const match = index.byNormalizedName.get(normalized) ?? index.byNormalizedAlias.get(normalized);
  if (match) return { ingredientId: match.id, name: match.name, category: match.category };

  // 未知の食材名 -> マスターへ新規登録。
  // idは正規化名から決定論的に導出する(analysisId等と同じ考え方)。こうすることで、
  // レシート/音声の一括登録のように同じ未登録食材名を複数リクエストが同時に処理した場合でも
  // 全員が同じidに収束し、下のConditionExpressionが後発リクエストを弾いてくれるため、
  // 同名の食材マスターが重複作成されることがない(以前はULIDで採番しており、
  // 並行実行時に同名で複数レコードができてしまう競合状態があった)。
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
    // TTL切れを待たず、同一ウォームコンテナ内の後続呼び出しがすぐ見つけられるようにする。
    cache?.items.push(item);
    return { ingredientId: id, name: rawName, category: categoryHint };
  } catch (err) {
    if (!isConditionalCheckFailed(err)) throw err;
    // 同時に別のリクエストが同じ正規化名の食材を先に作成済み -> それを使う(重複作成の回避)。
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
