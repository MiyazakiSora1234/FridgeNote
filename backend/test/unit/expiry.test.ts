import { describe, expect, it } from "vitest";
import { computeExpiryStatus } from "../../src/services/fridgeService.js";

describe("computeExpiryStatus", () => {
  const now = new Date("2026-09-05T00:00:00Z");

  it("returns none when expiresAt is null", () => {
    expect(computeExpiryStatus(null, now)).toBe("none");
  });

  it("returns expired for a past date", () => {
    expect(computeExpiryStatus("2026-09-01", now)).toBe("expired");
  });

  it("returns soon within 3 days", () => {
    expect(computeExpiryStatus("2026-09-07", now)).toBe("soon");
  });

  it("returns ok when more than 3 days away", () => {
    expect(computeExpiryStatus("2026-09-20", now)).toBe("ok");
  });

  it("treats today as soon, not expired", () => {
    expect(computeExpiryStatus("2026-09-05", now)).toBe("soon");
  });

  it("falls back to 'none' instead of silently claiming 'ok' for an unparseable date", () => {
    // API入力側はDateOnlyStringSchemaで弾く設計だが、既存データ破損等への防御としてここでも確認する。
    expect(computeExpiryStatus("not-a-date", now)).toBe("none");
  });
});
