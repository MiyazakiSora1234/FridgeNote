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
  source: "manual" | "image_food" | "image_dish_consume" | "receipt" | "voice";
}

export type AnalysisType = "food" | "dish" | "receipt";
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

/**
 * レシートOCR/音声認識、どちらも最終的に「食材名+数量+単位」のリストに正規化される。
 * 同じ形にしておくことで、確認画面(チェックリスト+一括登録)のUIとバックエンドの
 * 一括登録エンドポイントをレシート/音声の両方で共通利用できる。
 */
export interface ParsedIngredientItem {
  name: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  confidence: number;
  /** AI_CONFIDENCE_THRESHOLD(lib/config.ts)を下回るかどうか。バックエンドで判定してから返す。 */
  belowConfidenceThreshold: boolean;
}

export interface ReceiptAnalysisResult {
  kind: "receipt";
  items: ParsedIngredientItem[];
}

export type AnalysisResult = FoodAnalysisResult | DishAnalysisResult | ReceiptAnalysisResult;

export interface ImageAnalysis {
  entityType: "ImageAnalysis";
  userId: string;
  analysisId: string;
  imageKey: string;
  type: AnalysisType;
  status: AnalysisStatus;
  result: AnalysisResult | null;
  errorReason?: string;
  /** trueの場合、リトライしても絶対に成功しないと判定済みの失敗(AiFatalError)。markProcessingが再処理をブロックする。 */
  terminallyFailed?: boolean;
  userFeedback?: unknown;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

/**
 * 音声入力は画像ではないため ImageAnalysis とは別エンティティにする
 * (既存のImageAnalysisの形・テストに影響を与えないため)。
 * ステータス遷移・冪等性・ユーザーフィードバック記録の考え方はImageAnalysisと共通。
 */
export interface VoiceAnalysis {
  entityType: "VoiceAnalysis";
  userId: string;
  analysisId: string;
  audioKey: string;
  status: AnalysisStatus;
  transcript?: string;
  result: { items: ParsedIngredientItem[] } | null;
  errorReason?: string;
  terminallyFailed?: boolean;
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
