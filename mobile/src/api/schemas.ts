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

export const AnalysisTypeSchema = z.enum(["food", "dish", "receipt"]);
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

/**
 * レシートOCR/音声認識、どちらも最終的にこの形(食材名+数量+単位+確信度)に正規化されて
 * 返ってくる(backend/src/types/index.ts の ParsedIngredientItem と同じ形)。
 * 確認画面(チェックリスト+一括登録)を両方で共通利用できるようにするため。
 */
export const ParsedIngredientItemSchema = z.object({
  name: z.string(),
  ingredientId: z.string(),
  quantity: z.number(),
  unit: z.string(),
  confidence: z.number(),
  belowConfidenceThreshold: z.boolean(),
});

export const ReceiptAnalysisResultSchema = z.object({
  kind: z.literal("receipt"),
  items: z.array(ParsedIngredientItemSchema),
});

export const AnalysisResultSchema = z.union([
  FoodAnalysisResultSchema,
  DishAnalysisResultSchema,
  ReceiptAnalysisResultSchema,
]);

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

/**
 * 音声入力は画像ではないため ImageAnalysis とは別のエンティティ・エンドポイント
 * (GET /v1/voice/transcriptions/:id)を使うが、ステータス遷移の考え方は共通。
 */
export const VoiceAnalysisSchema = z.object({
  analysisId: z.string(),
  audioKey: z.string(),
  status: AnalysisStatusSchema,
  transcript: z.string().optional(),
  result: z.object({ items: z.array(ParsedIngredientItemSchema) }).nullable(),
  errorReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateVoiceTranscriptionResponseSchema = z.object({
  analysisId: z.string(),
  status: AnalysisStatusSchema,
});

/** レシート/音声の確認画面で「すべて追加」を押したときのレスポンス。 */
export const BulkCreateFridgeItemsResponseSchema = z.object({
  items: z.array(FridgeItemSchema),
});

export const IngredientCandidateSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  category: z.string(),
  score: z.number(),
});

export const IngredientSearchResponseSchema = z.object({
  candidates: z.array(IngredientCandidateSchema),
});

export type ExpiryStatus = z.infer<typeof ExpiryStatusSchema>;
export type FridgeItem = z.infer<typeof FridgeItemSchema>;
export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export type FoodAnalysisResult = z.infer<typeof FoodAnalysisResultSchema>;
export type DishAnalysisIngredient = z.infer<typeof DishAnalysisIngredientSchema>;
export type DishAnalysisResult = z.infer<typeof DishAnalysisResultSchema>;
export type ParsedIngredientItem = z.infer<typeof ParsedIngredientItemSchema>;
export type ReceiptAnalysisResult = z.infer<typeof ReceiptAnalysisResultSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
export type VoiceAnalysis = z.infer<typeof VoiceAnalysisSchema>;
export type IngredientCandidate = z.infer<typeof IngredientCandidateSchema>;
