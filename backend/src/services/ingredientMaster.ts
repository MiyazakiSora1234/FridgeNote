import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/dynamo.js";
import { newId } from "../lib/ids.js";
import { normalizeIngredientName } from "../lib/normalize.js";
import type { Ingredient } from "../types/index.js";

const MASTER_PARTITION = "INGREDIENT_MASTER";

/**
 * 食材マスター全件をロードし、正規化名 -> Ingredient のマップを作る。
 * 5人規模・食材種別も高々数百件程度の想定のため、全件ロードで十分(将来
 * 件数が増えた場合はGSI3を直接引くクエリに切り替える)。
 */
async function loadAllIngredients(): Promise<Ingredient[]> {
  const items: Ingredient[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :pk",
        ExpressionAttributeValues: { ":pk": MASTER_PARTITION },
        ExclusiveStartKey,
      }),
    );
    for (const raw of res.Items ?? []) items.push(raw as Ingredient);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
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
        PK: `INGREDIENT#${id}`,
        SK: "METADATA",
        GSI3PK: MASTER_PARTITION,
        GSI3SK: `NAME#${normalized}`,
        ...item,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );
  return { ingredientId: id, name: rawName, category: categoryHint };
}

export async function getIngredientById(ingredientId: string): Promise<Ingredient | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `INGREDIENT#${ingredientId}`, SK: "METADATA" },
    }),
  );
  return (res.Item as Ingredient | undefined) ?? null;
}
