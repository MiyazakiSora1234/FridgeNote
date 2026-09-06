import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { deterministicIdFromKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { NotFoundError } from "../lib/errors.js";
import type { AnalysisResult, AnalysisType, ImageAnalysis } from "../types/index.js";

const ANALYSIS_TTL_DAYS = 90;

function analysisPrimaryKey(userId: string, analysisId: string) {
  return { PK: Keys.user(userId), SK: Keys.analysis(analysisId) };
}

export async function createAnalysis(
  userId: string,
  imageKey: string,
  type: AnalysisType,
): Promise<{ analysisId: string; status: ImageAnalysis["status"]; created: boolean }> {
  const analysisId = deterministicIdFromKey(imageKey);
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + ANALYSIS_TTL_DAYS * 24 * 60 * 60;

  const item: ImageAnalysis = {
    entityType: "ImageAnalysis",
    userId,
    analysisId,
    imageKey,
    type,
    status: "pending",
    result: null,
    createdAt: now,
    updatedAt: now,
    ttl,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...analysisPrimaryKey(userId, analysisId),
          ...item,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return { analysisId, status: "pending", created: true };
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      const existing = await getAnalysis(userId, analysisId);
      return { analysisId, status: existing.status, created: false };
    }
    throw err;
  }
}

export async function getAnalysis(userId: string, analysisId: string): Promise<ImageAnalysis> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: analysisPrimaryKey(userId, analysisId),
    }),
  );
  if (!res.Item) throw NotFoundError("analysis not found");
  return res.Item as ImageAnalysis;
}

export async function markProcessing(userId: string, analysisId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: analysisPrimaryKey(userId, analysisId),
        UpdateExpression: "SET #status = :processing, updatedAt = :now",
        ConditionExpression: "#status <> :completed AND attribute_not_exists(terminallyFailed)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":processing": "processing",
          ":completed": "completed",
          ":now": new Date().toISOString(),
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) return false;
    throw err;
  }
}

export async function completeAnalysis(
  userId: string,
  analysisId: string,
  result: AnalysisResult,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: analysisPrimaryKey(userId, analysisId),
      UpdateExpression: "SET #status = :completed, #result = :result, updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status", "#result": "result" },
      ExpressionAttributeValues: {
        ":completed": "completed",
        ":result": result,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

export async function recordUserFeedback(
  userId: string,
  analysisId: string,
  feedback: unknown,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: analysisPrimaryKey(userId, analysisId),
      UpdateExpression: "SET userFeedback = :feedback, updatedAt = :now",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: { ":feedback": feedback, ":now": new Date().toISOString() },
    }),
  );
}

export async function failAnalysis(
  userId: string,
  analysisId: string,
  reason: string,
  options?: { terminal?: boolean },
): Promise<void> {
  const sets = ["#status = :failed", "errorReason = :reason", "updatedAt = :now"];
  const values: Record<string, unknown> = { ":failed": "failed", ":reason": reason, ":now": new Date().toISOString() };
  if (options?.terminal) {
    sets.push("terminallyFailed = :true");
    values[":true"] = true;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: analysisPrimaryKey(userId, analysisId),
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: values,
    }),
  );
}

export function userIdFromImageKey(imageKey: string): string | null {
  const match = /^users\/([^/]+)\/uploads\//.exec(imageKey);
  return match ? match[1] ?? null : null;
}
