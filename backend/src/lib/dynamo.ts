import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME ?? "FridgeNoteTable";

/**
 * DynamoDBの条件付き書き込み(ConditionExpression)が条件不成立で弾かれたエラーかどうかを判定する。
 * 各serviceが `(err as { name?: string }).name === "ConditionalCheckFailedException"` を
 * 個別にtry/catchするより、この述語関数を通すことで意図が読み取りやすくなる。
 */
export function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "ConditionalCheckFailedException"
  );
}
