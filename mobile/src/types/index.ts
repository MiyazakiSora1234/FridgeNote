/**
 * 型定義そのものは api/schemas.ts (zodスキーマからの z.infer) が単一の情報源。
 * 画面側は従来通り "../types" からインポートできるよう、ここで再エクスポートする。
 */
export type {
  ExpiryStatus,
  FridgeItem,
  AnalysisType,
  AnalysisStatus,
  FoodAnalysisResult,
  DishAnalysisIngredient,
  DishAnalysisResult,
  AnalysisResult,
  ImageAnalysis,
} from "../api/schemas";
