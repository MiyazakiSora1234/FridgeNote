import { z } from "zod";

/**
 * バックエンドのレスポンス形状をここで定義し、api/client.ts が実際に
 * ランタイムで検証する。以前は型注釈だけ(コンパイル時のみ)で、
 * バックエンドのレスポンスが実際にその形をしているかは保証していなかった
 * ため、将来APIが変わった際に画面の奥でundefinedアクセスして落ちる、
 * といった壊れ方をしかねなかった。
 *
 * mobile/src/types/index.ts はここから型を再エクスポートしているだけなので、
 * 型定義はこのファイルが単一の情報源(single source of truth)になる。
 */

export const ExpiryStatusSchema = z.enum(["expired", "soon", "ok", "none"]);

export const FridgeItemSchema = z.object({
  itemId: z.string(),
  ingredientId: z.string(),
  name: z.string(),
  category: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiryStatus: ExpiryStatusSchema,
});

export const FridgeItemListResponseSchema = z.object({
  items: z.array(FridgeItemSchema),
});

export const AnalysisTypeSchema = z.enum(["food", "dish"]);
export const AnalysisStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);

export const FoodAnalysisResultSchema = z.object({
  kind: z.literal("food"),
  name: z.string(),
  ingredientId: z.string(),
  category: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiresAtEstimate: z.string().nullable(),
  confidence: z.number(),
});

export const DishAnalysisIngredientSchema = z.object({
  name: z.string(),
  ingredientId: z.string(),
  confidence: z.number(),
});

export const DishAnalysisResultSchema = z.object({
  kind: z.literal("dish"),
  dish: z.string(),
  ingredients: z.array(DishAnalysisIngredientSchema),
});

export const AnalysisResultSchema = z.union([FoodAnalysisResultSchema, DishAnalysisResultSchema]);

export const ImageAnalysisSchema = z.object({
  analysisId: z.string(),
  type: AnalysisTypeSchema,
  status: AnalysisStatusSchema,
  result: AnalysisResultSchema.nullable(),
  errorReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PresignedUrlResponseSchema = z.object({
  imageKey: z.string(),
  uploadUrl: z.string(),
  expiresIn: z.number(),
});

export const CreateAnalysisResponseSchema = z.object({
  analysisId: z.string(),
  status: z.string(),
});

export const ConsumeResponseSchema = z.object({
  consumed: z.array(z.object({ ingredientId: z.string(), newQuantity: z.number() })),
  skipped: z.array(z.object({ ingredientId: z.string(), reason: z.string() })),
});

export type ExpiryStatus = z.infer<typeof ExpiryStatusSchema>;
export type FridgeItem = z.infer<typeof FridgeItemSchema>;
export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export type FoodAnalysisResult = z.infer<typeof FoodAnalysisResultSchema>;
export type DishAnalysisIngredient = z.infer<typeof DishAnalysisIngredientSchema>;
export type DishAnalysisResult = z.infer<typeof DishAnalysisResultSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
