import { describe, expect, it } from "vitest";
import {
  BulkCreateFridgeItemsResponseSchema,
  ConsumeResponseSchema,
  FridgeItemListResponseSchema,
  FridgeItemSchema,
  ImageAnalysisSchema,
  IngredientSearchResponseSchema,
  PresignedUrlResponseSchema,
  VoiceAnalysisSchema,
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

  it("accepts a completed receipt analysis with normalized items", () => {
    const result = ImageAnalysisSchema.safeParse({
      analysisId: "a6",
      type: "receipt",
      status: "completed",
      result: {
        kind: "receipt",
        items: [
          {
            name: "鶏もも肉",
            ingredientId: "ing_1",
            quantity: 1,
            unit: "pack",
            confidence: 0.96,
            belowConfidenceThreshold: false,
          },
          {
            name: "玉ねぎ",
            ingredientId: "ing_2",
            quantity: 1,
            unit: "個",
            confidence: 0.3,
            belowConfidenceThreshold: true,
          },
        ],
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("VoiceAnalysisSchema", () => {
  it("accepts a completed voice analysis", () => {
    const result = VoiceAnalysisSchema.safeParse({
      analysisId: "v1",
      audioKey: "users/u1/audio/clip.m4a",
      status: "completed",
      transcript: "鶏もも肉300グラムと卵6個を追加",
      result: {
        items: [
          { name: "鶏もも肉", ingredientId: "ing_1", quantity: 300, unit: "g", confidence: 0.95, belowConfidenceThreshold: false },
        ],
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a pending voice analysis with a null result and no transcript yet", () => {
    const result = VoiceAnalysisSchema.safeParse({
      analysisId: "v2",
      audioKey: "users/u1/audio/clip2.m4a",
      status: "pending",
      result: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("strips unrelated DynamoDB fields (PK/SK/entityType) the API may echo back", () => {
    const result = VoiceAnalysisSchema.safeParse({
      PK: "USER#u1",
      SK: "VOICE#v3",
      entityType: "VoiceAnalysis",
      userId: "u1",
      analysisId: "v3",
      audioKey: "users/u1/audio/clip3.m4a",
      status: "pending",
      result: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("PK");
  });
});

describe("BulkCreateFridgeItemsResponseSchema", () => {
  it("accepts multiple created fridge items", () => {
    const result = BulkCreateFridgeItemsResponseSchema.safeParse({
      items: [
        {
          itemId: "item_1",
          ingredientId: "ing_1",
          name: "鶏もも肉",
          category: "meat",
          quantity: 1,
          unit: "pack",
          expiresAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
          expiryStatus: "none",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("IngredientSearchResponseSchema", () => {
  it("accepts a list of scored candidates", () => {
    const result = IngredientSearchResponseSchema.safeParse({
      candidates: [{ ingredientId: "ing_tomato", name: "トマト", category: "vegetable", score: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty candidate list", () => {
    expect(IngredientSearchResponseSchema.safeParse({ candidates: [] }).success).toBe(true);
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
