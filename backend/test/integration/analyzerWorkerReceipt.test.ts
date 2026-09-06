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

// 実際のS3・Textractは呼ばず、Mock Adapterに差し替える
// (docs/architecture.md「AI ProcessはService/Adapterとして分離する」に対応)。
vi.mock("../../src/services/s3.js", () => ({
  getObjectAsBase64: vi.fn().mockResolvedValue({ base64: "ZmFrZQ==", contentType: "image/jpeg" }),
}));

const mockExtractText = vi.fn().mockResolvedValue("鶏もも肉 298\nたまご 248\n玉ねぎ 198");
vi.mock("../../src/services/ai/OcrService.js", () => ({
  TextractOcrService: vi.fn().mockImplementation(() => ({ extractText: mockExtractText })),
}));

// Bedrock呼び出し自体(invokeBedrockTool)だけをモックし、BedrockReceiptAnalysisServiceの
// 実装(Zodによるレスポンス検証を含む)は本物を使う。こうすることで「Bedrockが不正な
// JSONを返したときに本当にSchema Validationで弾かれるか」まで検証できる
// (ReceiptAnalysisService自体を丸ごとモックすると、その検証ロジックを素通りしてしまう)。
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
    // 食材マスターへ正規化されていること(ingredientIdが割り当てられている)
    expect(stored?.result.items[0].ingredientId).toBeTruthy();
    // confidence 0.3 の玉ねぎは閾値(既定0.6)未満と判定されていること
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
    // required fields (quantity/unit/confidence) が欠けた、実在しないはずのBedrock応答を模擬する
    mockToolOutput = { items: [{ name: "鶏もも肉" }] };

    const userId = "user-1";
    const imageKey = `users/${userId}/uploads/receipt3.jpg`;
    const analysisId = seedPendingReceipt(userId, imageKey);

    const response = await handler({ Records: [s3EventSqsRecord("fridgenote-images", imageKey)] });

    // スキーマ不正は再試行しても直らないため、DLQ行きにはせずbatchItemFailuresへは入れない
    expect(response.batchItemFailures).toEqual([]);
    const stored = fakeDdb.store.get(`USER#${userId}#ANALYSIS#${analysisId}`);
    expect(stored?.status).toBe("failed");
    expect(stored?.errorReason).toBe("ai_response_invalid");
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
