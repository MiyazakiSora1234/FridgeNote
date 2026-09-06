import { VOICE_ANALYSIS_JSON_SCHEMA, RawParsedItemsSchema, type RawParsedItems } from "../../schemas/aiSchemas.js";
import { AiResponseInvalidError } from "./errors.js";
import { invokeBedrockTool } from "./bedrockToolInvoker.js";

/** 音声認識テキストから追加したい食材を抽出するAIサービスの境界。 */
export interface VoiceAnalysisService {
  analyzeTranscript(transcript: string): Promise<RawParsedItems>;
}

const VOICE_TOOL_NAME = "report_voice_items";

export class BedrockVoiceAnalysisService implements VoiceAnalysisService {
  async analyzeTranscript(transcript: string): Promise<RawParsedItems> {
    return invokeBedrockTool({
      systemPrompt:
        "あなたは音声入力解析アシスタントです。ユーザーが話した「冷蔵庫に追加したい食材」の" +
        "音声認識テキストから、食材名・数量・単位を抽出してください。数量や単位が" +
        "明示されていない場合は数量1・単位「個」としてください。必ず提供されたツールを" +
        "使って構造化データのみで回答し、自由形式の文章では回答しないでください。",
      userText: `以下はユーザーの音声を認識したテキストです。追加したい食材を抽出してください。\n\n${transcript}`,
      toolName: VOICE_TOOL_NAME,
      toolDescription: "音声から抽出した食材の一覧を報告する",
      jsonSchema: VOICE_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawParsedItemsSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }
}

/** テスト用。実際のBedrockを呼ばず、固定の解析結果を返す。 */
export class MockVoiceAnalysisService implements VoiceAnalysisService {
  constructor(
    private readonly fixedResult: RawParsedItems = {
      items: [
        { name: "鶏もも肉", quantity: 300, unit: "g", confidence: 0.95 },
        { name: "卵", quantity: 6, unit: "個", confidence: 0.93 },
      ],
    },
  ) {}

  async analyzeTranscript(): Promise<RawParsedItems> {
    return this.fixedResult;
  }
}
