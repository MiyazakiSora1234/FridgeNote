import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * logger.ts はモジュール読み込み時に一度だけ LOG_LEVEL を評価するため、
 * レベルごとの挙動を検証するにはテストごとに vi.resetModules() で
 * モジュールキャッシュを破棄してから読み直す必要がある。
 */
async function freshLogger() {
  vi.resetModules();
  const mod = await import("../../src/lib/logger.js");
  return mod.logger;
}

describe("logger", () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it("suppresses lower-severity logs when LOG_LEVEL is set higher (warn)", async () => {
    process.env.LOG_LEVEL = "warn";
    const logger = await freshLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.debug("suppressed");
    logger.info("also suppressed");
    logger.warn("shown");
    logger.error("also shown");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("defaults to info level when LOG_LEVEL is unset or invalid", async () => {
    process.env.LOG_LEVEL = "not_a_real_level";
    const logger = await freshLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.debug("suppressed by the default info level");
    logger.info("shown");

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("emits one JSON line per call containing timestamp/level/message and the given fields", async () => {
    process.env.LOG_LEVEL = "info";
    const logger = await freshLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.info("something_happened", { analysisId: "a1", count: 3 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(entry).toMatchObject({ level: "info", message: "something_happened", analysisId: "a1", count: 3 });
    expect(typeof entry.timestamp).toBe("string");
  });

  it("child() binds extra fields that appear on every subsequent log line from it", async () => {
    process.env.LOG_LEVEL = "info";
    const logger = await freshLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const child = logger.child({ analysisId: "a1", userId: "u1" });
    child.info("step_one");
    child.info("step_two", { extra: true });

    const first = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    const second = JSON.parse(logSpy.mock.calls[1]?.[0] as string);
    expect(first).toMatchObject({ analysisId: "a1", userId: "u1", message: "step_one" });
    expect(second).toMatchObject({ analysisId: "a1", userId: "u1", message: "step_two", extra: true });
  });

  it("serializes an `err` field into a structured error object, including custom fields like reason", async () => {
    process.env.LOG_LEVEL = "info";
    const logger = await freshLogger();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { AiFatalError } = await import("../../src/services/ai/errors.js");

    logger.error("bedrock_invocation_fatal", {
      reason: "bedrock_quota_exceeded",
      err: new AiFatalError("Bedrock invocation failed fatally (bedrock_quota_exceeded)", "bedrock_quota_exceeded"),
    });

    const entry = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(entry.error).toMatchObject({
      name: "AiFatalError",
      message: "Bedrock invocation failed fatally (bedrock_quota_exceeded)",
      reason: "bedrock_quota_exceeded",
    });
    expect(typeof entry.error.stack).toBe("string");
  });
});
