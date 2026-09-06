import { z } from "zod";

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
