import { describe, expect, it } from "vitest";
import { isRetryableError } from "../../src/services/ai/BedrockVisionAdapter.js";

describe("isRetryableError", () => {
  it("treats known non-retryable AWS error names as non-retryable", () => {
    expect(isRetryableError({ name: "AccessDeniedException" })).toBe(false);
    expect(isRetryableError({ name: "ValidationException" })).toBe(false);
    expect(isRetryableError({ name: "ResourceNotFoundException" })).toBe(false);
    expect(isRetryableError({ name: "UnrecognizedClientException" })).toBe(false);
  });

  it("treats throttling/transient-style errors as retryable", () => {
    expect(isRetryableError({ name: "ThrottlingException" })).toBe(true);
    expect(isRetryableError({ name: "ServiceUnavailableException" })).toBe(true);
    expect(isRetryableError({ name: "TimeoutError" })).toBe(true);
  });

  it("treats errors with no recognizable name as retryable (fail open)", () => {
    expect(isRetryableError(new Error("network down"))).toBe(true);
    expect(isRetryableError("some string error")).toBe(true);
    expect(isRetryableError(undefined)).toBe(true);
  });
});
