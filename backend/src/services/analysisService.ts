import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { analysisIdFromImageKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import { NotFoundError } from "../lib/errors.js";
import type { AnalysisResult, AnalysisType, ImageAnalysis } from "../types/index.js";

const ANALYSIS_TTL_DAYS = 90;

/** この service 内で繰り返し使うPK/SKの組み立てをここに集約する。 */
function analysisPrimaryKey(userId: string, analysisId: string) {
  return { PK: Keys.user(userId), SK: Keys.analysis(analysisId) };
}

/**
 * 解析ジョブを作成する。imageKeyから決定論的にanalysisIdを導出し、
 * 既に存在すればそれをそのまま返す(同一画像の再送信・多重APIコールへの冪等性)。
 */
export async function createAnalysis(
  userId: string,
  imageKey: string,
  type: AnalysisType,
): Promise<{ analysisId: string; status: ImageAnalysis["status"]; created: boolean }> {
  const analysisId = analysisIdFromImageKey(imageKey);
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
          GSI2PK: Keys.imageKey(imageKey),
          GSI2SK: Keys.analysis(analysisId),
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

/**
 * Analyzer Workerが処理開始時に呼ぶ。
 * status=completedの場合のみスキップ(重複S3イベント/SQS再配信への冪等性)。
 * pending/processing/failedからは常にprocessingへ遷移できるようにし、
 * 一時的なエラーでSQSが再配信してきた際に正しくリトライできるようにする
 * (厳密にpendingからのみ遷移可とすると、1回目の失敗でfailedへ遷移した後の
 * 再配信がブロックされてしまい、リトライが機能しなくなるため)。
 */
export async function markProcessing(userId: string, analysisId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: analysisPrimaryKey(userId, analysisId),
        UpdateExpression: "SET #status = :processing, updatedAt = :now",
        ConditionExpression: "#status <> :completed",
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
    if (isConditionalCheckFailed(err)) return false; // 既に完了済み -> 重複メッセージとしてスキップ
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

/**
 * AIの認識結果に対してユーザーが実際に確定・修正した内容を記録する
 * (docs/architecture.md「将来のAI再学習データとして使えるよう保存する」に対応)。
 * AI結果(result)は書き換えず、userFeedbackに別枠で保持することで
 * 「AIの生出力」と「ユーザー確定値」を分離したまま両方追跡できるようにする。
 * 呼び出し元は補助的な記録として扱い、失敗してもメインの処理は止めないこと
 * (存在しない/他人のanalysisIdが渡ってきても本流の登録処理自体は失敗させたくないため)。
 */
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
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: analysisPrimaryKey(userId, analysisId),
      UpdateExpression: "SET #status = :failed, errorReason = :reason, updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":failed": "failed",
        ":reason": reason,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

/** S3オブジェクトキーから userId を抽出する (`users/{sub}/uploads/{uuid}.jpg`)。 */
export function userIdFromImageKey(imageKey: string): string | null {
  const match = /^users\/([^/]+)\/uploads\//.exec(imageKey);
  return match ? match[1] ?? null : null;
}
