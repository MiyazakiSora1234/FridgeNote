import type { RawDishAnalysis, RawFoodAnalysis } from "../../schemas/aiSchemas.js";

export interface VisionAIService {
  analyzeFoodImage(input: { base64: string; contentType: string }): Promise<RawFoodAnalysis>;
  analyzeDishImage(input: { base64: string; contentType: string }): Promise<RawDishAnalysis>;
}

export { AiFatalError, AiInvocationError, AiResponseInvalidError } from "./errors.js";
