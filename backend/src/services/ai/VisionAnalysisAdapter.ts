import type { RawDishAnalysis, RawFoodAnalysis } from "../../schemas/aiSchemas.js";

/**
 * 画像解析AIのアダプタ境界。
 * 現在はAmazon Bedrockで実装するが、将来自前推論(SageMaker等)へ
 * 置き換える場合もこのインターフェースを満たす別実装を追加しDIするだけで済むようにする。
 */
export interface VisionAnalysisAdapter {
  analyzeFoodImage(input: { base64: string; contentType: string }): Promise<RawFoodAnalysis>;
  analyzeDishImage(input: { base64: string; contentType: string }): Promise<RawDishAnalysis>;
}

export class AiResponseInvalidError extends Error {
  constructor(
    message: string,
    public raw: unknown,
  ) {
    super(message);
  }
}

export class AiInvocationError extends Error {}
