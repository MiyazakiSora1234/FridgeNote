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
import { logger, type Logger } from "../lib/logger.js";
import { BedrockVisionAdapter } from "../services/ai/BedrockVisionAdapter.js";
import { AiFatalError, AiResponseInvalidError } from "../services/ai/errors.js";
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
  logger.info("analyzer_worker_batch_started", { recordCount: event.Records.length });

  for (const record of event.Records) {
    const log = logger.child({ messageId: record.messageId });
    try {
      await processRecord(record, log);
    } catch (err) {
      log.error("record_processing_failed_will_be_redelivered", { err });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  logger.info("analyzer_worker_batch_finished", {
    recordCount: event.Records.length,
    failureCount: batchItemFailures.length,
  });
  return { batchItemFailures };
}

async function processRecord(record: SQSRecord, log: Logger): Promise<void> {
  const s3Event = JSON.parse(record.body) as S3Event;
  for (const s3Record of s3Event.Records ?? []) {
    await processS3Record(s3Record, log);
  }
}

async function processS3Record(s3Record: S3EventRecord, log: Logger): Promise<void> {
  const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

  if (key.includes("/audio/")) {
    await processAudioRecord(key, log);
  } else {
    await processImageRecord(key, log);
  }
}

async function processImageRecord(imageKey: string, parentLog: Logger): Promise<void> {
  const userId = userIdFromImageKey(imageKey);
  if (!userId) {
    parentLog.error("image_key_userid_extraction_failed", { imageKey });
    return; // 想定外のキー形式。再試行しても直らないためスキップ(削除)
  }

  const analysisId = deterministicIdFromKey(imageKey);
  const log = parentLog.child({ analysisId, userId, imageKey });
  const analysis = await getImageAnalysisRecordOrThrow(userId, analysisId);

  const started = await markProcessing(userId, analysisId);
  if (!started) {
    log.info("image_analysis_already_processing_or_completed_skipping");
    return;
  }

  log.info("image_analysis_started", { type: analysis.type });
  await runWithFailureHandling(
    async () => {
      const result = await analyzeByType(analysis);
      await completeAnalysis(userId, analysisId, result);
      log.info("image_analysis_completed", { type: analysis.type });
    },
    (reason) => failAnalysis(userId, analysisId, reason),
    log,
  );
}

async function processAudioRecord(audioKey: string, parentLog: Logger): Promise<void> {
  const userId = userIdFromAudioKey(audioKey);
  if (!userId) {
    parentLog.error("audio_key_userid_extraction_failed", { audioKey });
    return;
  }

  const analysisId = deterministicIdFromKey(audioKey);
  const log = parentLog.child({ analysisId, userId, audioKey });
  const analysis = await getVoiceAnalysisRecordOrThrow(userId, analysisId);

  const started = await markVoiceProcessing(userId, analysisId);
  if (!started) {
    log.info("voice_analysis_already_processing_or_completed_skipping");
    return;
  }

  log.info("voice_analysis_started");
  await runWithFailureHandling(
    async () => {
      const { transcript, items } = await analyzeVoice(analysis.audioKey);
      await completeVoiceAnalysis(userId, analysisId, transcript, items);
      log.info("voice_analysis_completed", { itemCount: items.length, transcriptLength: transcript.length });
    },
    (reason) => failVoiceAnalysis(userId, analysisId, reason),
    log,
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
 * - AIレスポンスが構造的に不正、または権限不足・入力不正・モデル不整合・日次トークン
 *   クォータ超過など「リトライしても絶対に成功しない」と判定できたエラー(AiFatalError)
 *   -> 再試行しても直らないため失敗確定し、例外を再スローしない(=SQS再配信させない。
 *   再配信しても同じ理由で必ずまた失敗するだけで、Bedrock呼び出し回数だけを無駄に
 *   増やしてしまうため。特に日次トークンクォータ超過時にこれをやると、
 *   ただでさえ枯渇しているクォータをさらに消費してしまう)。
 * - それ以外(Bedrock/Textract/Transcribe呼び出し失敗・S3取得失敗等の一過性エラー) ->
 *   再スローしてSQS再試行 -> それでも直らなければ最終的にDLQ。
 * 以前はImageAnalysis用・VoiceAnalysis用で同じtry/catchを2箇所に書きそうになったため、
 * fail関数を引数として受け取る形で共通化した。
 */
async function runWithFailureHandling(
  work: () => Promise<void>,
  fail: (reason: string) => Promise<void>,
  log: Logger,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof AiResponseInvalidError) {
      log.error("ai_response_invalid", { err, raw: err.raw });
      await fail("ai_response_invalid");
      return;
    }
    if (err instanceof AiFatalError) {
      log.error("ai_fatal_error_not_retrying", { err, reason: err.reason });
      await fail(err.reason);
      return; // 再スローしない = このSQSメッセージは「処理済み」として扱われ、再配信されない
    }
    log.warn("analysis_failed_will_retry_via_sqs", { err });
    await fail("processing_error").catch((failErr) => log.error("failed_to_record_failure_status", { err: failErr }));
    throw err;
  }
}
