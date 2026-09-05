export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

export interface FridgeItem {
  itemId: string;
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiryStatus: ExpiryStatus;
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
  analysisId: string;
  type: AnalysisType;
  status: AnalysisStatus;
  result: AnalysisResult | null;
  errorReason?: string;
  createdAt: string;
  updatedAt: string;
}
