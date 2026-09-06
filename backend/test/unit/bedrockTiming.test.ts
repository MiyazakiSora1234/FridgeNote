import { describe, expect, it } from "vitest";
import {
  INVOKE_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_BUDGET_MS,
  WORKER_LAMBDA_TIMEOUT_MS,
} from "../../src/services/ai/BedrockVisionAdapter.js";

describe("Bedrock retry timing budget (guard rail)", () => {
  // このテストの目的: 誰かが将来 INVOKE_TIMEOUT_MS や MAX_RETRIES を
  // 変更したときに、Analyzer WorkerのLambdaタイムアウトを超えてしまう
  // 組み合わせへ静かに戻ってしまうのを機械的に検知する
  // (実際に過去そうなって、Lambdaが強制終了しfailAnalysis()すら
  // 呼ばれない事故につながった)。

  it("keeps the worst-case Bedrock retry time within OVERALL_BUDGET_MS", () => {
    const worstCase = INVOKE_TIMEOUT_MS * MAX_RETRIES;
    expect(worstCase).toBeLessThanOrEqual(OVERALL_BUDGET_MS);
  });

  it("leaves enough margin under the worker Lambda's timeout for S3/DynamoDB work around the Bedrock call", () => {
    const marginMs = WORKER_LAMBDA_TIMEOUT_MS - OVERALL_BUDGET_MS;
    expect(marginMs).toBeGreaterThanOrEqual(10_000);
  });
});
