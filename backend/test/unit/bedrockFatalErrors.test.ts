import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ThrottlingException(日次トークンクォータ超過含む)・AccessDeniedException等の
 * エラー分類を、実際にinvokeBedrockTool()を通して検証する。
 * bedrockRetry.test.ts は isRetryableError() 単体のホワイトボックステストだが、
 * こちらは「実際にBedrockクライアントがそのエラーを返したとき、何回呼ばれ、
 * 最終的にどんな例外(AiFatalError vs AiInvocationError)が投げられるか」という
 * 呼び出し元(analyzerWorker)から見える振る舞いを検証する。
 */
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  ConverseCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

const { invokeBedrockTool } = await import("../../src/services/ai/bedrockToolInvoker.js");
const { AiFatalError, AiInvocationError } = await import("../../src/services/ai/errors.js");

function baseParams() {
  return {
    systemPrompt: "system",
    userText: "user",
    toolName: "test_tool",
    toolDescription: "desc",
    jsonSchema: {},
    parse: (raw: unknown) => raw,
  };
}

function awsError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("invokeBedrockTool: fatal (non-retryable) error classification", () => {
  it("fails immediately without retrying on AccessDeniedException", async () => {
    mockSend.mockRejectedValue(awsError("AccessDeniedException", "not authorized"));

    const error = await invokeBedrockTool(baseParams()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiFatalError);
    expect(error).toMatchObject({ reason: "bedrock_access_denied" });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on ValidationException", async () => {
    mockSend.mockRejectedValue(awsError("ValidationException", "bad input"));

    await expect(invokeBedrockTool(baseParams())).rejects.toMatchObject({ reason: "bedrock_validation_error" });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on ResourceNotFoundException (model/region mismatch)", async () => {
    mockSend.mockRejectedValue(awsError("ResourceNotFoundException", "model not found"));

    await expect(invokeBedrockTool(baseParams())).rejects.toMatchObject({ reason: "bedrock_resource_not_found" });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on UnrecognizedClientException", async () => {
    mockSend.mockRejectedValue(awsError("UnrecognizedClientException", "bad credentials"));

    await expect(invokeBedrockTool(baseParams())).rejects.toMatchObject({ reason: "bedrock_unrecognized_client" });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("fails immediately (no local retry) when ThrottlingException indicates daily token quota exhaustion", async () => {
    mockSend.mockRejectedValue(
      awsError("ThrottlingException", "Too many tokens per day, please wait before trying again."),
    );

    await expect(invokeBedrockTool(baseParams())).rejects.toMatchObject({ reason: "bedrock_quota_exceeded" });
    expect(mockSend).toHaveBeenCalledTimes(1); // 秒間Throttlingとは異なりリトライしても無意味なため1回で打ち切る
  });

  it("still retries a plain per-second ThrottlingException up to MAX_RETRIES times, then raises a retryable AiInvocationError", async () => {
    mockSend.mockRejectedValue(awsError("ThrottlingException", "Rate exceeded"));

    await expect(invokeBedrockTool(baseParams())).rejects.toBeInstanceOf(AiInvocationError);
    expect(mockSend).toHaveBeenCalledTimes(3); // MAX_RETRIES
  }, 10_000);
});
