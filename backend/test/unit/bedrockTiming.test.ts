import { describe, expect, it } from "vitest";
import {
  INVOKE_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_BUDGET_MS,
  WORKER_LAMBDA_TIMEOUT_MS,
} from "../../src/services/ai/BedrockVisionAdapter.js";

describe("Bedrock retry timing budget (guard rail)", () => {
  it("keeps the worst-case Bedrock retry time within OVERALL_BUDGET_MS", () => {
    const worstCase = INVOKE_TIMEOUT_MS * MAX_RETRIES;
    expect(worstCase).toBeLessThanOrEqual(OVERALL_BUDGET_MS);
  });

  it("leaves enough margin under the worker Lambda's timeout for S3/DynamoDB work around the Bedrock call", () => {
    const marginMs = WORKER_LAMBDA_TIMEOUT_MS - OVERALL_BUDGET_MS;
    expect(marginMs).toBeGreaterThanOrEqual(10_000);
  });
});
