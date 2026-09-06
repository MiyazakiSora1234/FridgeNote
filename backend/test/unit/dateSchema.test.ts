import { describe, expect, it } from "vitest";
import { DateOnlyStringSchema } from "../../src/lib/dateSchema.js";

describe("DateOnlyStringSchema", () => {
  it("accepts a valid calendar date", () => {
    expect(DateOnlyStringSchema.safeParse("2026-09-20").success).toBe(true);
  });

  it("accepts a valid leap-day date", () => {
    expect(DateOnlyStringSchema.safeParse("2024-02-29").success).toBe(true);
  });

  it("rejects a non-existent month", () => {
    expect(DateOnlyStringSchema.safeParse("2026-13-01").success).toBe(false);
  });

  it("rejects a non-existent day-of-month (Feb 30)", () => {
    expect(DateOnlyStringSchema.safeParse("2026-02-30").success).toBe(false);
  });

  it("rejects Feb 29 on a non-leap year", () => {
    expect(DateOnlyStringSchema.safeParse("2026-02-29").success).toBe(false);
  });

  it("rejects a value that doesn't even match the YYYY-MM-DD shape", () => {
    expect(DateOnlyStringSchema.safeParse("2026/09/20").success).toBe(false);
    expect(DateOnlyStringSchema.safeParse("not a date").success).toBe(false);
  });
});
