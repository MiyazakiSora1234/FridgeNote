import { z } from "zod";

/**
 * Bedrockへ渡すJSON Schema(Tool useのinput schemaとしても、プロンプト内提示用としても使う)。
 * confidenceは0〜1に限定し、自由形式の文章生成を許さない。
 */
export const FOOD_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "写っている食材名(日本語)" },
    category: {
      type: "string",
      enum: ["vegetable", "fruit", "meat", "fish", "dairy", "seasoning", "grain", "other"],
    },
    quantity: { type: "number", description: "推定個数または量" },
    unit: { type: "string", description: "個/g/ml など" },
    expiresAtEstimate: {
      type: ["string", "null"],
      description: "推定賞味期限(YYYY-MM-DD)。不明ならnull",
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["name", "category", "quantity", "unit", "confidence"],
  additionalProperties: false,
} as const;

export const DISH_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    dish: { type: "string", description: "料理名(日本語)" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["name", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["dish", "ingredients"],
  additionalProperties: false,
} as const;

/** Bedrockの生レスポンス(正規化前)をバックエンドで検証するためのZodスキーマ */
export const RawFoodAnalysisSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum([
    "vegetable",
    "fruit",
    "meat",
    "fish",
    "dairy",
    "seasoning",
    "grain",
    "other",
  ]),
  quantity: z.number().finite().positive().max(100000),
  unit: z.string().min(1).max(20),
  expiresAtEstimate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  confidence: z.number().min(0).max(1),
});
export type RawFoodAnalysis = z.infer<typeof RawFoodAnalysisSchema>;

export const RawDishIngredientSchema = z.object({
  name: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
});

export const RawDishAnalysisSchema = z.object({
  dish: z.string().min(1).max(200),
  ingredients: z.array(RawDishIngredientSchema).min(1).max(30),
});
export type RawDishAnalysis = z.infer<typeof RawDishAnalysisSchema>;

/** confidenceがこの値未満の場合、UIに「認識結果を確認してください」を出す閾値 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
