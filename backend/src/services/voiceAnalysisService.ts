import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { deterministicIdFromKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { NotFoundError } from "../lib/errors.js";
import type { AnalysisStatus, ParsedIngredientItem, VoiceAnalysis } from "../types/index.js";

const ANALYSIS_TTL_DAYS = 90;

/**
 * 音声入力の解析ジョブを管理するservice。
 * 画像(ImageAnalysis/analysisService.ts)とはエンティティが別だが、
 * ステータス遷移・冪等性・ユーザーフィードバック記録の考え方は完全に共通のため、
 * analysisService.tsと同じ構造で実装している(将来共通化する場合は
 * ジェネリックな AnalysisJobRepository<T> に抽出する余地がある)。
 */
function voicePrimaryKey(userId: string, analysisId: string) {
  return { PK: Keys.user(userId), SK: Keys.voiceAnalysis(analysisId) };
}

export async function createVoiceAnalysis(
  userId: string,
  audioKey: string,
): Promise<{ analysisId: string; status: AnalysisStatus; created: boolean }> {
  const analysisId = deterministicIdFromKey(audioKey);
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + ANALYSIS_TTL_DAYS * 24 * 60 * 60;

  const item: VoiceAnalysis = {
    entityType: "VoiceAnalysis",
    userId,
    analysisId,
    audioKey,
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
        Item: { ...voicePrimaryKey(userId, analysisId), ...item },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return { analysisId, status: "pending", created: true };
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      const existing = await getVoiceAnalysis(userId, analysisId);
      return { analysisId, status: existing.status, created: false };
    }
    throw err;
  }
}

export async function getVoiceAnalysis(userId: string, analysisId: string): Promise<VoiceAnalysis> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: voicePrimaryKey(userId, analysisId) }),
  );
  if (!res.Item) throw NotFoundError("voice analysis not found");
  return res.Item as VoiceAnalysis;
}

/**
 * analysisService.markProcessing と同じ考え方(status=completedの場合のみスキップ)。
 * terminallyFailed(AiFatalErrorによる恒久的失敗)の場合も同様にスキップする
 * (analysisService.markProcessingのコメント参照)。
 */
export async function markVoiceProcessing(userId: string, analysisId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: voicePrimaryKey(userId, analysisId),
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

export async function completeVoiceAnalysis(
  userId: string,
  analysisId: string,
  transcript: string,
  items: ParsedIngredientItem[],
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: voicePrimaryKey(userId, analysisId),
      UpdateExpression: "SET #status = :completed, transcript = :transcript, #result = :result, updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status", "#result": "result" },
      ExpressionAttributeValues: {
        ":completed": "completed",
        ":transcript": transcript,
        ":result": { items },
        ":now": new Date().toISOString(),
      },
    }),
  );
}

/** @param options.terminal analysisService.failAnalysisと同じ意味(AiFatalErrorによる恒久的失敗)。 */
export async function failVoiceAnalysis(
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
      Key: voicePrimaryKey(userId, analysisId),
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: values,
    }),
  );
}

export async function recordVoiceUserFeedback(userId: string, analysisId: string, feedback: unknown): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: voicePrimaryKey(userId, analysisId),
      UpdateExpression: "SET userFeedback = :feedback, updatedAt = :now",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: { ":feedback": feedback, ":now": new Date().toISOString() },
    }),
  );
}

/** S3オブジェクトキーから userId を抽出する (`users/{sub}/audio/{uuid}.m4a`)。 */
export function userIdFromAudioKey(audioKey: string): string | null {
  const match = /^users\/([^/]+)\/audio\//.exec(audioKey);
  return match ? (match[1] ?? null) : null;
}
