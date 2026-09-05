import type { S3Event, S3EventRecord, SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/dynamo.js";
import { analysisIdFromImageKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import {
  completeAnalysis,
  failAnalysis,
  markProcessing,
  userIdFromImageKey,
} from "../services/analysisService.js";
import { getObjectAsBase64 } from "../services/s3.js";
import { resolveIngredientId } from "../services/ingredientMaster.js";
import { BedrockVisionAdapter } from "../services/ai/BedrockVisionAdapter.js";
import { AiResponseInvalidError } from "../services/ai/VisionAnalysisAdapter.js";
import type { AnalysisResult, DishAnalysisResult, FoodAnalysisResult, ImageAnalysis } from "../types/index.js";

const aiAdapter = new BedrockVisionAdapter();

/**
 * S3イベント通知(ObjectCreated)を直接受け取るSQSキューのコンシューマ。
 * SQSのバッチ処理ではPartial Batch Response(batchItemFailures)を使い、
 * 1メッセージの失敗が他メッセージの再処理を巻き込まないようにする。
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      console.error("failed to process record", record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

async function processRecord(record: SQSRecord): Promise<void> {
  const s3Event = JSON.parse(record.body) as S3Event;
  for (const s3Record of s3Event.Records ?? []) {
    await processS3Record(s3Record);
  }
}

async function processS3Record(s3Record: S3EventRecord): Promise<void> {
  const imageKey = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

  const userId = userIdFromImageKey(imageKey);
  if (!userId) {
    console.error("could not extract userId from imageKey, skipping", imageKey);
    return; // 想定外のキー形式。再試行しても直らないためスキップ(削除)
  }

  const analysisId = analysisIdFromImageKey(imageKey);
  const analysis = await getAnalysisRecordOrThrow(userId, analysisId);

  const started = await markProcessing(userId, analysisId);
  if (!started) {
    console.log("analysis already processing/completed, skipping", analysisId);
    return;
  }

  await runAnalysis(userId, analysisId, analysis);
}

/**
 * クライアントの POST /v1/analyses 呼び出しがS3イベントより遅れて到着するレースコンディションに対応するため、
 * レコードが見つからない場合はエラーをthrowしてSQSに再配信させる(Visibility Timeout経過後)。
 * それでも一定回数見つからなければDLQへ送られ、運用者が気づけるようにする。
 */
async function getAnalysisRecordOrThrow(userId: string, analysisId: string): Promise<ImageAnalysis> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: Keys.user(userId), SK: Keys.analysis(analysisId) },
    }),
  );
  if (!res.Item) {
    throw new Error(`analysis record not yet created for analysisId=${analysisId}, retrying`);
  }
  return res.Item as ImageAnalysis;
}

async function analyzeFood(imageKey: string): Promise<FoodAnalysisResult> {
  const { base64, contentType } = await getObjectAsBase64(imageKey);
  const raw = await aiAdapter.analyzeFoodImage({ base64, contentType });
  const { ingredientId, name, category } = await resolveIngredientId(raw.name, raw.category);
  return {
    kind: "food",
    name,
    ingredientId,
    category,
    quantity: raw.quantity,
    unit: raw.unit,
    expiresAtEstimate: raw.expiresAtEstimate ?? null,
    confidence: raw.confidence,
  };
}

async function analyzeDish(imageKey: string): Promise<DishAnalysisResult> {
  const { base64, contentType } = await getObjectAsBase64(imageKey);
  const raw = await aiAdapter.analyzeDishImage({ base64, contentType });
  const ingredients = await Promise.all(
    raw.ingredients.map(async (ing) => {
      const resolved = await resolveIngredientId(ing.name);
      return { name: resolved.name, ingredientId: resolved.ingredientId, confidence: ing.confidence };
    }),
  );
  return { kind: "dish", dish: raw.dish, ingredients };
}

async function runAnalysis(userId: string, analysisId: string, analysis: ImageAnalysis): Promise<void> {
  try {
    const result: AnalysisResult =
      analysis.type === "food" ? await analyzeFood(analysis.imageKey) : await analyzeDish(analysis.imageKey);
    await completeAnalysis(userId, analysisId, result);
  } catch (err) {
    if (err instanceof AiResponseInvalidError) {
      await handlePermanentFailure(userId, analysisId, err);
      return;
    }
    await handleTransientFailure(userId, analysisId, err);
  }
}

/** AIレスポンスが構造的に不正 -> 再試行しても直らないため失敗確定し、DLQには送らない(メッセージは正常終了扱い)。 */
async function handlePermanentFailure(
  userId: string,
  analysisId: string,
  err: AiResponseInvalidError,
): Promise<void> {
  console.error("AI response invalid", analysisId, err.message, err.raw);
  await failAnalysis(userId, analysisId, "ai_response_invalid");
}

/** Bedrock呼び出し失敗・S3取得失敗等は一過性の可能性があるため再スローしてSQS再試行 -> 最終的にDLQ。 */
async function handleTransientFailure(userId: string, analysisId: string, err: unknown): Promise<never> {
  console.error("analysis failed, will retry", analysisId, err);
  await failAnalysis(userId, analysisId, "processing_error").catch(() => undefined);
  throw err;
}
