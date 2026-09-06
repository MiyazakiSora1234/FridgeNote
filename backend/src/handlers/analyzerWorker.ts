import type { S3Event, S3EventRecord, SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/dynamo.js";
import { deterministicIdFromKey } from "../lib/ids.js";
import { Keys } from "../lib/keys.js";
import {
  completeAnalysis,
  failAnalysis,
  markProcessing,
  userIdFromImageKey,
} from "../services/analysisService.js";
import {
  completeVoiceAnalysis,
  failVoiceAnalysis,
  markVoiceProcessing,
  userIdFromAudioKey,
} from "../services/voiceAnalysisService.js";
import { getObjectAsBase64, s3UriFor, transcribeMediaFormatFor } from "../services/s3.js";
import { resolveIngredientId } from "../services/ingredientMaster.js";
import { normalizeParsedItems } from "../services/parsedItemsNormalization.js";
import { BedrockVisionAdapter } from "../services/ai/BedrockVisionAdapter.js";
import { AiResponseInvalidError } from "../services/ai/errors.js";
import { TextractOcrService } from "../services/ai/OcrService.js";
import { BedrockReceiptAnalysisService } from "../services/ai/ReceiptAnalysisService.js";
import { TranscribeTranscriptionService } from "../services/ai/TranscriptionService.js";
import { BedrockVoiceAnalysisService } from "../services/ai/VoiceAnalysisService.js";
import type {
  AnalysisResult,
  DishAnalysisResult,
  FoodAnalysisResult,
  ImageAnalysis,
  ParsedIngredientItem,
  ReceiptAnalysisResult,
  VoiceAnalysis,
} from "../types/index.js";

// AI Adapter層はすべてインターフェース越しに使う(Lambda内にBedrock/Textract/Transcribeの
// SDK呼び出しを直書きしない)。テストではこれらをMock実装に差し替える。
const visionAI = new BedrockVisionAdapter();
const ocrService = new TextractOcrService();
const receiptAnalysisService = new BedrockReceiptAnalysisService();
const transcriptionService = new TranscribeTranscriptionService();
const voiceAnalysisService = new BedrockVoiceAnalysisService();

/**
 * S3イベント通知(ObjectCreated)を直接受け取るSQSキューのコンシューマ。
 * 画像(食材/料理/レシート)・音声(音声入力)のどちらもこの1つのキュー・1つの
 * Lambdaで処理する(S3キーのプレフィックスで振り分ける)。メディア種別ごとに
 * 別々のSQS/Lambdaを新設すると、5ユーザー規模には過剰な構成になり
 * コスト・運用の両面で不利なため。
 *
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
  const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

  if (key.includes("/audio/")) {
    await processAudioRecord(key);
  } else {
    await processImageRecord(key);
  }
}

async function processImageRecord(imageKey: string): Promise<void> {
  const userId = userIdFromImageKey(imageKey);
  if (!userId) {
    console.error("could not extract userId from imageKey, skipping", imageKey);
    return; // 想定外のキー形式。再試行しても直らないためスキップ(削除)
  }

  const analysisId = deterministicIdFromKey(imageKey);
  const analysis = await getImageAnalysisRecordOrThrow(userId, analysisId);

  const started = await markProcessing(userId, analysisId);
  if (!started) {
    console.log("analysis already processing/completed, skipping", analysisId);
    return;
  }

  await runWithFailureHandling(
    async () => {
      const result = await analyzeByType(analysis);
      await completeAnalysis(userId, analysisId, result);
    },
    (reason) => failAnalysis(userId, analysisId, reason),
  );
}

async function processAudioRecord(audioKey: string): Promise<void> {
  const userId = userIdFromAudioKey(audioKey);
  if (!userId) {
    console.error("could not extract userId from audioKey, skipping", audioKey);
    return;
  }

  const analysisId = deterministicIdFromKey(audioKey);
  const analysis = await getVoiceAnalysisRecordOrThrow(userId, analysisId);

  const started = await markVoiceProcessing(userId, analysisId);
  if (!started) {
    console.log("voice analysis already processing/completed, skipping", analysisId);
    return;
  }

  await runWithFailureHandling(
    async () => {
      const { transcript, items } = await analyzeVoice(analysis.audioKey);
      await completeVoiceAnalysis(userId, analysisId, transcript, items);
    },
    (reason) => failVoiceAnalysis(userId, analysisId, reason),
  );
}

/**
 * クライアントの POST /v1/analyses (または /v1/voice/transcriptions) 呼び出しが
 * S3イベントより遅れて到着するレースコンディションに対応するため、レコードが
 * 見つからない場合はエラーをthrowしてSQSに再配信させる(Visibility Timeout経過後)。
 * それでも一定回数見つからなければDLQへ送られ、運用者が気づけるようにする。
 */
async function getImageAnalysisRecordOrThrow(userId: string, analysisId: string): Promise<ImageAnalysis> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: Keys.user(userId), SK: Keys.analysis(analysisId) } }),
  );
  if (!res.Item) {
    throw new Error(`analysis record not yet created for analysisId=${analysisId}, retrying`);
  }
  return res.Item as ImageAnalysis;
}

async function getVoiceAnalysisRecordOrThrow(userId: string, analysisId: string): Promise<VoiceAnalysis> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: Keys.user(userId), SK: Keys.voiceAnalysis(analysisId) } }),
  );
  if (!res.Item) {
    throw new Error(`voice analysis record not yet created for analysisId=${analysisId}, retrying`);
  }
  return res.Item as VoiceAnalysis;
}

async function analyzeFood(imageKey: string): Promise<FoodAnalysisResult> {
  const { base64, contentType } = await getObjectAsBase64(imageKey);
  const raw = await visionAI.analyzeFoodImage({ base64, contentType });
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
  const raw = await visionAI.analyzeDishImage({ base64, contentType });
  const ingredients = await Promise.all(
    raw.ingredients.map(async (ing) => {
      const resolved = await resolveIngredientId(ing.name);
      return { name: resolved.name, ingredientId: resolved.ingredientId, confidence: ing.confidence };
    }),
  );
  return { kind: "dish", dish: raw.dish, ingredients };
}

/**
 * レシート: 画像 → OCR(Textract) → テキストをBedrockへ渡して構造化 → 食材マスター正規化。
 * OCR結果をそのままFridgeItemにはしない(Schema Validation + ユーザー確認を必ず挟む)。
 */
async function analyzeReceipt(imageKey: string): Promise<ReceiptAnalysisResult> {
  const { base64, contentType } = await getObjectAsBase64(imageKey);
  const ocrText = await ocrService.extractText({ base64, contentType });
  const raw = await receiptAnalysisService.analyzeReceiptText(ocrText);
  const items = await normalizeParsedItems(raw);
  return { kind: "receipt", items };
}

async function analyzeByType(analysis: ImageAnalysis): Promise<AnalysisResult> {
  switch (analysis.type) {
    case "food":
      return analyzeFood(analysis.imageKey);
    case "dish":
      return analyzeDish(analysis.imageKey);
    case "receipt":
      return analyzeReceipt(analysis.imageKey);
  }
}

/**
 * 音声: S3上の音声 → Transcribe(音声はダウンロードせずS3 URIのまま渡す) → テキストを
 * Bedrockへ渡して構造化 → 食材マスター正規化。
 * TranscribeのジョブIDは呼び出しごとに一意にする(analysisIdをそのまま使うと、
 * 一時的な失敗でSQSが再配信してきた際に同名ジョブが既に存在してエラーになるため)。
 * 冪等性はTranscribe側ではなくDynamoDBのステータス管理(markVoiceProcessing)で担保する。
 */
async function analyzeVoice(audioKey: string): Promise<{ transcript: string; items: ParsedIngredientItem[] }> {
  const jobName = `fridgenote-${deterministicIdFromKey(audioKey)}-${Date.now()}`;
  const transcript = await transcriptionService.transcribe({
    s3Uri: s3UriFor(audioKey),
    mediaFormat: transcribeMediaFormatFor(audioKey),
    jobName,
  });
  const raw = await voiceAnalysisService.analyzeTranscript(transcript);
  const items = await normalizeParsedItems(raw);
  return { transcript, items };
}

/**
 * 画像/音声どちらの解析でも共通のエラー分岐:
 * - AIレスポンスが構造的に不正 -> 再試行しても直らないため失敗確定し、DLQには送らない。
 * - それ以外(Bedrock/Textract/Transcribe呼び出し失敗・S3取得失敗等) -> 一過性の可能性が
 *   あるため再スローしてSQS再試行 -> 最終的にDLQ。
 * 以前はImageAnalysis用・VoiceAnalysis用で同じtry/catchを2箇所に書きそうになったため、
 * fail関数を引数として受け取る形で共通化した。
 */
async function runWithFailureHandling(work: () => Promise<void>, fail: (reason: string) => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof AiResponseInvalidError) {
      console.error("AI response invalid", err.message, err.raw);
      await fail("ai_response_invalid");
      return;
    }
    console.error("analysis failed, will retry", err);
    await fail("processing_error").catch(() => undefined);
    throw err;
  }
}
