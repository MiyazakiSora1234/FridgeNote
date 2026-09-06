import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQSEvent } from "aws-lambda";
import { createFakeDdb } from "./fakeDynamo.js";

/**
 * クライアントがpresigned URLでS3へアップロードした後、POST /v1/analyses
 * (または /v1/voice/transcriptions)を結局呼ばなかった(アプリを閉じた・通信断等)場合、
 * S3のObjectCreatedイベントは発火するがDynamoDBレコードは永久に作られない。
 * このとき無限にDLQへ送り続けてアラームを鳴らし続けるのではなく、SQSの最終配信試行
 * (ApproximateReceiveCount >= maxReceiveCount)まで見つからなければ諦めて正常終了する
 * ことを確認する(analyzerWorker.tsのgetImageAnalysisRecordOrGiveUp参照)。
 */
const fakeDdb = createFakeDdb();

vi.mock("../../src/lib/dynamo.js", () => ({
  ddb: fakeDdb,
  TABLE_NAME: "TestTable",
  isConditionalCheckFailed: (err: unknown) =>
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ConditionalCheckFailedException",
}));

const { handler } = await import("../../src/handlers/analyzerWorker.js");

function s3EventSqsRecord(key: string, approximateReceiveCount: number, messageId = "msg-1") {
  return {
    messageId,
    attributes: { ApproximateReceiveCount: String(approximateReceiveCount) },
    body: JSON.stringify({ Records: [{ s3: { bucket: { name: "fridgenote-images" }, object: { key } } }] }),
  } as any;
}

beforeEach(() => {
  fakeDdb.store.clear();
});

describe("analyzerWorker: orphaned S3 event (client never called the create-record API)", () => {
  it("retries (batch item failure) on early delivery attempts when the ImageAnalysis record doesn't exist yet", async () => {
    const event: SQSEvent = { Records: [s3EventSqsRecord("users/user-1/uploads/orphan1.jpg", 1)] };
    const response = await handler(event);
    expect(response.batchItemFailures).toEqual([{ itemIdentifier: "msg-1" }]);
  });

  it("gives up gracefully (no batch item failure, no DLQ) on the final delivery attempt if the ImageAnalysis record still doesn't exist", async () => {
    const event: SQSEvent = { Records: [s3EventSqsRecord("users/user-1/uploads/orphan2.jpg", 3)] };
    const response = await handler(event);
    expect(response.batchItemFailures).toEqual([]);
    expect(fakeDdb.store.size).toBe(0); // 何も書き込まれていない
  });

  it("retries (batch item failure) on early delivery attempts when the VoiceAnalysis record doesn't exist yet", async () => {
    const event: SQSEvent = { Records: [s3EventSqsRecord("users/user-1/audio/orphan1.m4a", 2)] };
    const response = await handler(event);
    expect(response.batchItemFailures).toEqual([{ itemIdentifier: "msg-1" }]);
  });

  it("gives up gracefully on the final delivery attempt if the VoiceAnalysis record still doesn't exist", async () => {
    const event: SQSEvent = { Records: [s3EventSqsRecord("users/user-1/audio/orphan2.m4a", 3)] };
    const response = await handler(event);
    expect(response.batchItemFailures).toEqual([]);
    expect(fakeDdb.store.size).toBe(0);
  });
});
