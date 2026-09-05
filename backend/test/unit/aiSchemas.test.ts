import { describe, expect, it } from "vitest";
import { RawDishAnalysisSchema, RawFoodAnalysisSchema } from "../../src/schemas/aiSchemas.js";

describe("RawFoodAnalysisSchema", () => {
  it("accepts a well-formed AI response", () => {
    const result = RawFoodAnalysisSchema.safeParse({
      name: "トマト",
      category: "vegetable",
      quantity: 3,
      unit: "個",
      expiresAtEstimate: "2026-09-10",
      confidence: 0.92,
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidence outside 0-1", () => {
    const result = RawFoodAnalysisSchema.safeParse({
      name: "トマト",
      category: "vegetable",
      quantity: 3,
      unit: "個",
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown category (hallucinated free text)", () => {
    const result = RawFoodAnalysisSchema.safeParse({
      name: "トマト",
      category: "delicious_thing",
      quantity: 3,
      unit: "個",
      confidence: 0.9,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date estimate", () => {
    const result = RawFoodAnalysisSchema.safeParse({
      name: "トマト",
      category: "vegetable",
      quantity: 3,
      unit: "個",
      expiresAtEstimate: "next week",
      confidence: 0.9,
    });
    expect(result.success).toBe(false);
  });
});

describe("RawDishAnalysisSchema", () => {
  it("accepts a well-formed dish response", () => {
    const result = RawDishAnalysisSchema.safeParse({
      dish: "親子丼",
      ingredients: [
        { name: "鶏肉", confidence: 0.94 },
        { name: "卵", confidence: 0.98 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty ingredients array", () => {
    const result = RawDishAnalysisSchema.safeParse({ dish: "親子丼", ingredients: [] });
    expect(result.success).toBe(false);
  });
});
