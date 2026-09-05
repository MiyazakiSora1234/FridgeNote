import { describe, expect, it } from "vitest";
import { normalizeIngredientName } from "../../src/lib/normalize.js";

describe("normalizeIngredientName", () => {
  it("normalizes katakana to hiragana", () => {
    expect(normalizeIngredientName("トマト")).toBe(normalizeIngredientName("とまと"));
  });

  it("normalizes full-width alphanumerics to half-width and lowercases", () => {
    expect(normalizeIngredientName("Ｔｏｍａｔｏ")).toBe(normalizeIngredientName("tomato"));
    expect(normalizeIngredientName("TOMATO")).toBe(normalizeIngredientName("tomato"));
  });

  it("strips surrounding and internal whitespace", () => {
    expect(normalizeIngredientName("  鶏 肉 ")).toBe(normalizeIngredientName("鶏肉"));
  });

  it("treats different ingredients as different", () => {
    expect(normalizeIngredientName("トマト")).not.toBe(normalizeIngredientName("たまねぎ"));
  });
});
