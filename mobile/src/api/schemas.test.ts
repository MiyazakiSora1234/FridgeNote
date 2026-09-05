import { describe, expect, it } from "vitest";
import {
  ConsumeResponseSchema,
  FridgeItemListResponseSchema,
  FridgeItemSchema,
  ImageAnalysisSchema,
  PresignedUrlResponseSchema,
} from "./schemas";

describe("FridgeItemSchema", () => {
  it("accepts a well-formed fridge item", () => {
    const result = FridgeItemSchema.safeParse({
      itemId: "item_1",
      ingredientId: "ing_1",
      name: "トマト",
      category: "vegetable",
      quantity: 2,
      unit: "個",
      expiresAt: "2026-09-10",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      expiryStatus: "ok",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing required fields", () => {
    const result = FridgeItemSchema.safeParse({ itemId: "item_1" });
    expect(result.success).toBe(false);
  });

  it("rejects an unexpected expiryStatus value", () => {
    const result = FridgeItemSchema.safeParse({
      itemId: "item_1",
      ingredientId: "ing_1",
      name: "トマト",
      category: "vegetable",
      quantity: 2,
      unit: "個",
      expiresAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      expiryStatus: "not_a_real_status",
    });
    expect(result.success).toBe(false);
  });
});

describe("FridgeItemListResponseSchema", () => {
  it("accepts an empty item list", () => {
    expect(FridgeItemListResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it("rejects a bare array (missing the items wrapper)", () => {
    expect(FridgeItemListResponseSchema.safeParse([]).success).toBe(false);
  });
});

describe("ImageAnalysisSchema", () => {
  it("accepts a completed food analysis", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a1",
      type: "food",
      status: "completed",
      result: {
        kind: "food",
        name: "トマト",
        ingredientId: "ing_1",
        category: "vegetable",
        quantity: 1,
        unit: "個",
        expiresAtEstimate: null,
        confidence: 0.9,
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a completed dish analysis", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a2",
      type: "dish",
      status: "completed",
      result: {
        kind: "dish",
        dish: "親子丼",
        ingredients: [{ name: "鶏肉", ingredientId: "ing_2", confidence: 0.9 }],
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a pending analysis with a null result", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a3",
      type: "food",
      status: "pending",
      result: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized status value", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a4",
      type: "food",
      status: "not_a_real_status",
      result: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a result whose kind doesn't match either known shape", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a5",
      type: "food",
      status: "completed",
      result: { kind: "unknown_kind" },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("PresignedUrlResponseSchema / ConsumeResponseSchema", () => {
  it("accepts a well-formed presigned URL response", () => {
    const result = PresignedUrlResponseSchema.safeParse({
      imageKey: "users/u1/uploads/x.jpg",
      uploadUrl: "https://example.com/signed",
      expiresIn: 60,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed consume response, including skipped entries", () => {
    const result = ConsumeResponseSchema.safeParse({
      consumed: [{ ingredientId: "ing_1", newQuantity: 0 }],
      skipped: [{ ingredientId: "ing_2", reason: "not_in_fridge" }],
    });
    expect(result.success).toBe(true);
  });
});
