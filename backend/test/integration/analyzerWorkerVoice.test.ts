import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQSEvent } from "aws-lambda";
import { createFakeDdb } from "./fakeDynamo.js";

const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
  isConditionalCheckFailed: (err: unknown) =>
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ConditionalCheckFailedException",
}));

vi.mock("../../src/services/s3.js", () => ({
  s3UriFor: (key: string) => `s3://fake-bucket/${key}`,
  transcribeMediaFormatFor: () => "mp4",
}));

const mockTranscribe = vi.fn().mockResolvedValue("鶏もも肉300グラムと卵6個を追加");
vi.mock("../../src/services/ai/TranscriptionService.js", () => ({
  TranscribeTranscriptionService: vi.fn().mockImplementation(() => ({ transcribe: mockTranscribe })),
}));

// レシートのテストと同様、Bedrock呼び出し自体だけをモックし、
// BedrockVoiceAnalysisServiceの実装(Zod検証を含む)は本物を使う。
let mockToolOutput: unknown = {
  items: [
    { name: "鶏もも肉", quantity: 300, unit: "g", confidence: 0.95 },
    { name: "卵", quantity: 6, unit: "個", confidence: 0.93 },
  ],
};
const mockInvokeBedrockTool = vi.fn(async (params: { parse: (raw: unknown) => unknown }) =>
  params.parse(mockToolOutput),
);
vi.mock("../../src/services/ai/bedrockToolInvoker.js", () => ({
  invokeBedrockTool: (params: unknown) => mockInvokeBedrockTool(params as never),
}));

const { handler } = await import("../../src/handlers/analyzerWorker.js");
const { __resetIngredientCacheForTests } = await import("../../src/services/ingredientMaster.js");
const { deterministicIdFromKey } = await import("../../src/lib/ids.js");
const { AiFatalError } = await import("../../src/services/ai/errors.js");

function s3EventSqsRecord(bucket: string, key: string, messageId = "msg-1") {
  return {
    messageId,
    body: JSON.stringify({ Records: [{ s3: { bucket: { name: bucket }, object: { key } } }] }),
  } as any;
}

function seedPendingVoice(userId: string, audioKey: string) {
  const analysisId = deterministicIdFromKey(audioKey);
  fakeDdb.store.set(`USER#${userId}#VOICE#${analysisId}`, {
    PK: `USER#${userId}`,
    SK: `VOICE#${analysisId}`,
    entityType: "VoiceAnalysis",
    userId,
    analysisId,
    audioKey,
    status: "pending",
    result: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  return analysisId;
}

beforeEach(() => {
  fakeDdb.store.clear();
  __resetIngredientCacheForTests();
  mockTranscribe.mockClear();
  mockInvokeBedrockTool.mockClear();
  mockToolOutput = {
    items: [
      { name: "鶏もも肉", quantity: 300, unit: "g", confidence: 0.95 },
      { name: "卵", quantity: 6, unit: "個", confidence: 0.93 },
    ],
  };
});

describe("analyzerWorker: voice analysis", () => {
  it("runs Transcribe -> Bedrock -> normalization and completes the VoiceAnalysis with structured items", async () => {
    const userId = "user-1";
    const audioKey = `users/${userId}/audio/clip.m4a`;
    const analysisId = seedPendingVoice(userId, audioKey);

    const event: SQSEvent = { Records: [s3EventSqsRecord("fridgenote-images", audioKey)] };
    const response = await handler(event);

    expect(response.batchItemFailures).toEqual([]);
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(mockTranscribe.mock.calls[0]?.[0]).toMatchObject({ s3Uri: `s3://fake-bucket/${audioKey}` });

    const stored = fakeDdb.store.get(`USER#${userId}#VOICE#${analysisId}`) as any;
    expect(stored?.status).toBe("completed");
    expect(stored?.transcript).toBe("鶏もも肉300グラムと卵6個を追加");
    expect(stored?.result.items).toHaveLength(2);
    expect(stored?.result.items[0]).toMatchObject({ name: "鶏もも肉", quantity: 300, unit: "g" });
    expect(stored?.result.items[0].ingredientId).toBeTruthy();
  });

  it("is idempotent: a second S3 event for the same audioKey does not re-run Transcribe/Bedrock", async () => {
    const userId = "user-1";
    const audioKey = `users/${userId}/audio/clip2.m4a`;
    seedPendingVoice(userId, audioKey);

    const event: SQSEvent = { Records: [s3EventSqsRecord("fridgenote-images", audioKey)] };
    await handler(event);
    mockTranscribe.mockClear();
    mockInvokeBedrockTool.mockClear();

    await handler(event); // 重複配信を模擬

    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockInvokeBedrockTool).not.toHaveBeenCalled();
  });

  it("marks the voice analysis as failed when Bedrock's response fails schema validation", async () => {
    mockToolOutput = { items: [{ name: "鶏もも肉" }] }; // quantity/unit/confidence欠落

    const userId = "user-1";
    const audioKey = `users/${userId}/audio/clip3.m4a`;
    const analysisId = seedPendingVoice(userId, audioKey);

    const response = await handler({ Records: [s3EventSqsRecord("fridgenote-images", audioKey)] });

    expect(response.batchItemFailures).toEqual([]);
    const stored = fakeDdb.store.get(`USER#${userId}#VOICE#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("ai_response_invalid");
  });

  it("marks the voice analysis as failed and does NOT redeliver via SQS when Bedrock hits a fatal error (e.g. daily token quota exceeded)", async () => {
    mockInvokeBedrockTool.mockRejectedValueOnce(
      new AiFatalError("Bedrock invocation failed fatally (bedrock_quota_exceeded)", "bedrock_quota_exceeded"),
    );

    const userId = "user-1";
    const audioKey = `users/${userId}/audio/clip5.m4a`;
    const analysisId = seedPendingVoice(userId, audioKey);

    const response = await handler({
      Records: [s3EventSqsRecord("fridgenote-images", audioKey, "msg-fatal")],
    });

    expect(response.batchItemFailures).toEqual([]);
    const stored = fakeDdb.store.get(`USER#${userId}#VOICE#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("bedrock_quota_exceeded");
  });

  it("retries (batch item failure) when Transcribe fails transiently, without touching fridge inventory", async () => {
    mockTranscribe.mockRejectedValueOnce(new Error("Transcribe throttled"));

    const userId = "user-1";
    const audioKey = `users/${userId}/audio/clip4.m4a`;
    const analysisId = seedPendingVoice(userId, audioKey);

    const response = await handler({
      Records: [s3EventSqsRecord("fridgenote-images", audioKey, "msg-transient")],
    });

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: "msg-transient" }]);
    const stored = fakeDdb.store.get(`USER#${userId}#VOICE#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("processing_error");
  });
});
