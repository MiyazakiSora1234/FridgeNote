import {
  DISH_ANALYSIS_JSON_SCHEMA,
  FOOD_ANALYSIS_JSON_SCHEMA,
  RawDishAnalysisSchema,
  RawFoodAnalysisSchema,
  type RawDishAnalysis,
  type RawFoodAnalysis,
} from "../../schemas/aiSchemas.js";
import { AiResponseInvalidError } from "./errors.js";
import { invokeBedrockTool } from "./bedrockToolInvoker.js";
import type { VisionAIService } from "./VisionAnalysisAdapter.js";

// 既存コードやテストからのimportを壊さないよう、リトライ/タイムアウト系の定数と
// isRetryableError はここから再エクスポートする(実体は bedrockToolInvoker.ts)。
export {
  MAX_RETRIES,
  INVOKE_TIMEOUT_MS,
  OVERALL_BUDGET_MS,
  WORKER_LAMBDA_TIMEOUT_MS,
  isRetryableError,
} from "./bedrockToolInvoker.js";

const FOOD_TOOL_NAME = "report_food_analysis";
const DISH_TOOL_NAME = "report_dish_analysis";

export class BedrockVisionAdapter implements VisionAIService {
  async analyzeFoodImage(input: { base64: string; contentType: string }): Promise<RawFoodAnalysis> {
    return invokeBedrockTool({
      systemPrompt:
        "あなたは食品画像認識アシスタントです。画像に写っている単一の食材を分析し、必ず提供されたツールを使って構造化データのみで回答してください。自由形式の文章では回答しないでください。",
      userText: "この画像に写っている食材を分析してください。",
      image: input,
      toolName: FOOD_TOOL_NAME,
      toolDescription: "画像から検出した食材の情報を報告する",
      jsonSchema: FOOD_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawFoodAnalysisSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }

  async analyzeDishImage(input: { base64: string; contentType: string }): Promise<RawDishAnalysis> {
    return invokeBedrockTool({
      systemPrompt:
        "あなたは料理画像認識アシスタントです。画像に写っている料理名と、使用されている可能性が高い食材の候補をconfidence付きで報告してください。必ず提供されたツールを使って構造化データのみで回答してください。実際に使用されたかどうかは断定せず、あくまで候補として扱ってください。",
      userText: "この画像の料理名と、使用されている可能性がある食材候補を分析してください。",
      image: input,
      toolName: DISH_TOOL_NAME,
      toolDescription: "画像から検出した料理と使用食材候補を報告する",
      jsonSchema: DISH_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawDishAnalysisSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }
}
