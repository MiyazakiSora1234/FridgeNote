import type { RawDishAnalysis, RawFoodAnalysis } from "../../schemas/aiSchemas.js";

// 現在はBedrockで実装するが、将来別実装(SageMaker等)に差し替える場合もこの
// インターフェースを満たすAdapterを追加するだけで済むようにする。
export interface VisionAIService {
  analyzeFoodImage(input: { base64: string; contentType: string }): Promise<RawFoodAnalysis>;
  analyzeDishImage(input: { base64: string; contentType: string }): Promise<RawDishAnalysis>;
}

export { AiFatalError, AiInvocationError, AiResponseInvalidError } from "./errors.js";
