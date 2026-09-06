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
  getObjectAsBase64: vi.fn().mockResolvedValue({ base64: "ZmFrZQ==", contentType: "image/jpeg" }),
}));

const mockExtractText = vi.fn().mockResolvedValue("鶏もも肉 298\nたまご 248\n玉ねぎ 198");
vi.mock("../../src/services/ai/OcrService.js", () => ({
  TextractOcrService: vi.fn().mockImplementation(() => ({ extractText: mockExtractText })),
}));

let mockToolOutput: unknown = {
  items: [
    { name: "鶏もも肉", quantity: 1, unit: "pack", confidence: 0.96 },
    { name: "卵", quantity: 1, unit: "pack", confidence: 0.94 },
    { name: "玉ねぎ", quantity: 1, unit: "個", confidence: 0.3 },
  ],
};
const mockInvokeBedrockTool = vi.fn(async (params: { parse: (raw: unknown) => unknown; userText: string }) =>
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

function seedPendingReceipt(userId: string, imageKey: string) {
  const analysisId = deterministicIdFromKey(imageKey);
  fakeDdb.store.set(`USER#${userId}#ANALYSIS#${analysisId}`, {
    PK: `USER#${userId}`,
    SK: `ANALYSIS#${analysisId}`,
    entityType: "ImageAnalysis",
    userId,
    analysisId,
    imageKey,
    type: "receipt",
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
  mockExtractText.mockClear();
  mockInvokeBedrockTool.mockClear();
  mockToolOutput = {
    items: [
      { name: "鶏もも肉", quantity: 1, unit: "pack", confidence: 0.96 },
      { name: "卵", quantity: 1, unit: "pack", confidence: 0.94 },
      { name: "玉ねぎ", quantity: 1, unit: "個", confidence: 0.3 },
    ],
  };
});

describe("analyzerWorker: receipt analysis", () => {
  it("runs OCR -> Bedrock -> normalization and completes the ImageAnalysis with structured items", async () => {
    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt.jpg`;
    const analysisId = seedPendingReceipt(userId, imageKey);

    const event: SQSEvent = { Records: [s3EventSqsRecord("fridgenote-images", imageKey)] };
    const response = await handler(event);

    expect(response.batchItemFailures).toEqual([]);
    expect(mockExtractText).toHaveBeenCalledTimes(1);
    expect(mockInvokeBedrockTool).toHaveBeenCalledTimes(1);
    const callArgs = mockInvokeBedrockTool.mock.calls[0]?.[0] as { userText: string };
    expect(callArgs.userText).toContain("鶏もも肉 298");

    const stored = fakeDdb.store.get(`USER#${userId}#ANALYSIS#${analysisId}`) as any;
    expect(stored?.status).toBe("completed");
    expect(stored?.result.kind).toBe("receipt");
    expect(stored?.result.items).toHaveLength(3);
    expect(stored?.result.items[0]).toMatchObject({ name: "鶏もも肉", quantity: 1, unit: "pack" });
    expect(stored?.result.items[0].ingredientId).toBeTruthy();
    expect(stored?.result.items[2]).toMatchObject({ name: "玉ねぎ", belowConfidenceThreshold: true });
    expect(stored?.result.items[0]).toMatchObject({ belowConfidenceThreshold: false });
  });

  it("does not create a FridgeItem directly -- the receipt result stays as a candidate list", async () => {
    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt2.jpg`;
    seedPendingReceipt(userId, imageKey);

    await handler({ Records: [s3EventSqsRecord("fridgenote-images", imageKey)] });

    const fridgeItemKeys = [...fakeDdb.store.keys()].filter((k) => k.includes("#ITEM#"));
    expect(fridgeItemKeys).toHaveLength(0);
  });

  it("marks the analysis as failed (without sending to DLQ) when Bedrock's response fails schema validation", async () => {
    mockToolOutput = { items: [{ name: "鶏もも肉" }] };

    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt3.jpg`;
    const analysisId = seedPendingReceipt(userId, imageKey);

    const response = await handler({ Records: [s3EventSqsRecord("fridgenote-images", imageKey)] });

    expect(response.batchItemFailures).toEqual([]);
    const stored = fakeDdb.store.get(`USER#${userId}#ANALYSIS#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("ai_response_invalid");
  });

  it("marks the analysis as failed and does NOT redeliver via SQS when Bedrock hits a fatal error (e.g. daily token quota exceeded)", async () => {
    mockInvokeBedrockTool.mockRejectedValueOnce(
      new AiFatalError("Bedrock invocation failed fatally (bedrock_quota_exceeded)", "bedrock_quota_exceeded"),
    );

    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt5.jpg`;
    const analysisId = seedPendingReceipt(userId, imageKey);

    const response = await handler({
      Records: [s3EventSqsRecord("fridgenote-images", imageKey, "msg-fatal")],
    });

    expect(response.batchItemFailures).toEqual([]);
    const stored = fakeDdb.store.get(`USER#${userId}#ANALYSIS#${analysisId}`) as any;
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("bedrock_quota_exceeded");
    expect(stored?.terminallyFailed).toBe(true);
  });

  it("does not re-invoke Bedrock even if S3 redelivers the same event after a terminal (fatal) failure", async () => {
    mockInvokeBedrockTool.mockRejectedValueOnce(
      new AiFatalError("Bedrock invocation failed fatally (bedrock_quota_exceeded)", "bedrock_quota_exceeded"),
    );

    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt6.jpg`;
    seedPendingReceipt(userId, imageKey);

    await handler({ Records: [s3EventSqsRecord("fridgenote-images", imageKey, "msg-fatal-1")] });
    expect(mockInvokeBedrockTool).toHaveBeenCalledTimes(1);

    mockInvokeBedrockTool.mockClear();
    const response = await handler({
      Records: [s3EventSqsRecord("fridgenote-images", imageKey, "msg-fatal-2-duplicate-s3-event")],
    });

    expect(response.batchItemFailures).toEqual([]);
    expect(mockInvokeBedrockTool).not.toHaveBeenCalled();
  });

  it("reports the SQS message as a batch item failure (for retry) when OCR fails transiently", async () => {
    mockExtractText.mockRejectedValueOnce(new Error("Textract throttled"));

    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt4.jpg`;
    const analysisId = seedPendingReceipt(userId, imageKey);

    const response = await handler({
      Records: [s3EventSqsRecord("fridgenote-images", imageKey, "msg-transient")],
    });

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: "msg-transient" }]);
    const stored = fakeDdb.store.get(`USER#${userId}#ANALYSIS#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("processing_error");
  });
});
