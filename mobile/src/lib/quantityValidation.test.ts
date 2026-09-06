import { describe, expect, it } from "vitest";
import { isNonEmptyUnit, parsePositiveQuantity } from "./quantityValidation";

describe("parsePositiveQuantity", () => {
  it("parses a valid positive numeric string", () => {
    expect(parsePositiveQuantity("3")).toBe(3);
    expect(parsePositiveQuantity("0.5")).toBe(0.5);
  });

  it("rejects zero, negative, non-numeric, and empty input", () => {
    expect(parsePositiveQuantity("0")).toBeNull();
    expect(parsePositiveQuantity("-1")).toBeNull();
    expect(parsePositiveQuantity("abc")).toBeNull();
    expect(parsePositiveQuantity("")).toBeNull();
  });
});

describe("isNonEmptyUnit", () => {
  it("accepts a non-empty unit", () => {
    expect(isNonEmptyUnit("g")).toBe(true);
  });

  it("rejects an empty or whitespace-only unit", () => {
    expect(isNonEmptyUnit("")).toBe(false);
    expect(isNonEmptyUnit("   ")).toBe(false);
  });
});
