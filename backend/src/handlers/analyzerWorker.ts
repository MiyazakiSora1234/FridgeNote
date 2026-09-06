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

const visionAI = new BedrockVisionAdapter();
const ocrService = new TextractOcrService();
const receiptAnalysisService = new BedrockReceiptAnalysisService();
const transcriptionService = new TranscribeTranscriptionService();
const voiceAnalysisService = new BedrockVoiceAnalysisService();

// infra/sqs.tf の maxReceiveCount と一致させること。
const SQS_MAX_RECEIVE_COUNT = 3;

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
  const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? "1");
  for (const s3Record of s3Event.Records ?? []) {
    await processS3Record(s3Record, receiveCount, log);
  }
}

async function processS3Record(s3Record: S3EventRecord, receiveCount: number, log: Logger): Promise<void> {
  const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

  if (key.includes("/audio/")) {
    await processAudioRecord(key, receiveCount, log);
  } else {
    await processImageRecord(key, receiveCount, log);
  }
}

async function processImageRecord(imageKey: string, receiveCount: number, parentLog: Logger): Promise<void> {
  const userId = userIdFromImageKey(imageKey);
  if (!userId) {
    parentLog.error("image_key_userid_extraction_failed", { imageKey });
    return;
  }

  const analysisId = deterministicIdFromKey(imageKey);
  const log = parentLog.child({ analysisId, userId, imageKey });
  const analysis = await getImageAnalysisRecordOrGiveUp(userId, analysisId, receiveCount, log);
  if (!analysis) return;

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
    (reason, options) => failAnalysis(userId, analysisId, reason, options),
    log,
  );
}

async function processAudioRecord(audioKey: string, receiveCount: number, parentLog: Logger): Promise<void> {
  const userId = userIdFromAudioKey(audioKey);
  if (!userId) {
    parentLog.error("audio_key_userid_extraction_failed", { audioKey });
    return;
  }

  const analysisId = deterministicIdFromKey(audioKey);
  const log = parentLog.child({ analysisId, userId, audioKey });
  const analysis = await getVoiceAnalysisRecordOrGiveUp(userId, analysisId, receiveCount, log);
  if (!analysis) return;

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
    (reason, options) => failVoiceAnalysis(userId, analysisId, reason, options),
    log,
  );
}

async function getImageAnalysisRecordOrGiveUp(
  userId: string,
  analysisId: string,
  receiveCount: number,
  log: Logger,
): Promise<ImageAnalysis | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: Keys.user(userId), SK: Keys.analysis(analysisId) } }),
  );
  if (res.Item) return res.Item as ImageAnalysis;

  if (receiveCount >= SQS_MAX_RECEIVE_COUNT) {
    log.warn("image_analysis_record_never_created_giving_up", { receiveCount });
    return null;
  }
  throw new Error(`analysis record not yet created for analysisId=${analysisId}, retrying`);
}

async function getVoiceAnalysisRecordOrGiveUp(
  userId: string,
  analysisId: string,
  receiveCount: number,
  log: Logger,
): Promise<VoiceAnalysis | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: Keys.user(userId), SK: Keys.voiceAnalysis(analysisId) } }),
  );
  if (res.Item) return res.Item as VoiceAnalysis;

  if (receiveCount >= SQS_MAX_RECEIVE_COUNT) {
    log.warn("voice_analysis_record_never_created_giving_up", { receiveCount });
    return null;
  }
  throw new Error(`voice analysis record not yet created for analysisId=${analysisId}, retrying`);
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

async function runWithFailureHandling(
  work: () => Promise<void>,
  fail: (reason: string, options?: { terminal?: boolean }) => Promise<void>,
  log: Logger,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof AiResponseInvalidError) {
      log.error("ai_response_invalid", { err, raw: err.raw });
      await fail("ai_response_invalid", { terminal: true });
      return;
    }
    if (err instanceof AiFatalError) {
      log.error("ai_fatal_error_not_retrying", { err, reason: err.reason });
      await fail(err.reason, { terminal: true });
      return;
    }
    log.warn("analysis_failed_will_retry_via_sqs", { err });
    await fail("processing_error").catch((failErr) => log.error("failed_to_record_failure_status", { err: failErr }));
    throw err;
  }
}
