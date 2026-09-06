export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

export interface FridgeItem {
  entityType: "FridgeItem";
  userId: string;
  itemId: string;
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: "manual" | "image_food" | "image_dish_consume";
}

export type AnalysisType = "food" | "dish";
export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";

export interface FoodAnalysisResult {
  kind: "food";
  name: string;
  ingredientId: string;
  category: string;
  quantity: number;
  unit: string;
  expiresAtEstimate: string | null;
  confidence: number;
}

export interface DishAnalysisIngredient {
  name: string;
  ingredientId: string;
  confidence: number;
}

export interface DishAnalysisResult {
  kind: "dish";
  dish: string;
  ingredients: DishAnalysisIngredient[];
}

export type AnalysisResult = FoodAnalysisResult | DishAnalysisResult;

export interface ImageAnalysis {
  entityType: "ImageAnalysis";
  userId: string;
  analysisId: string;
  imageKey: string;
  type: AnalysisType;
  status: AnalysisStatus;
  result: AnalysisResult | null;
  errorReason?: string;
  userFeedback?: unknown;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface RecipeAnalysisIngredient {
  ingredientId: string;
  name: string;
  confidence: number;
  consumed: boolean;
  consumedQuantity?: number;
  unit?: string;
  /**
   * 消費確定時点でのFridgeItemの残量スナップショット。
   * POST /v1/fridge/consume の冪等リプレイ時に、初回と同じレスポンス
   * ({ consumed: [{ ingredientId, newQuantity }] }) を再構築するために保持する。
   */
  newQuantityAfterConsume?: number;
}

export interface RecipeAnalysis {
  entityType: "RecipeAnalysis";
  userId: string;
  analysisId: string;
  dishName: string;
  ingredients: RecipeAnalysisIngredient[];
  createdAt: string;
}

export interface Ingredient {
  entityType: "Ingredient";
  id: string;
  name: string;
  category: string;
  aliases: string[];
  createdAt: string;
}

export interface AuthContext {
  userId: string;
}
