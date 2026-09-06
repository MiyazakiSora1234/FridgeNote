import { RECEIPT_ANALYSIS_JSON_SCHEMA, RawParsedItemsSchema, type RawParsedItems } from "../../schemas/aiSchemas.js";
import { AiResponseInvalidError } from "./errors.js";
import { invokeBedrockTool } from "./bedrockToolInvoker.js";

/** OCRテキストから購入した食材候補を抽出するAIサービスの境界。 */
export interface ReceiptAnalysisService {
  analyzeReceiptText(ocrText: string): Promise<RawParsedItems>;
}

const RECEIPT_TOOL_NAME = "report_receipt_items";

export class BedrockReceiptAnalysisService implements ReceiptAnalysisService {
  async analyzeReceiptText(ocrText: string): Promise<RawParsedItems> {
    return invokeBedrockTool({
      systemPrompt:
        "あなたはレシート解析アシスタントです。OCRで読み取ったレシートのテキストから、" +
        "食品・食材と思われる項目だけを抽出してください。洗剤・雑誌・レジ袋・値引き・" +
        "合計金額・税金などの食品ではない項目は除外してください。数量が読み取れない場合は1、" +
        "単位が不明な場合は「個」としてください。必ず提供されたツールを使って構造化データのみで" +
        "回答し、自由形式の文章では回答しないでください。",
      userText: `以下はレシートをOCRで読み取ったテキストです。購入した食材を抽出してください。\n\n${ocrText}`,
      toolName: RECEIPT_TOOL_NAME,
      toolDescription: "レシートから抽出した食材の一覧を報告する",
      jsonSchema: RECEIPT_ANALYSIS_JSON_SCHEMA,
      parse: (raw) => {
        const result = RawParsedItemsSchema.safeParse(raw);
        if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
        return result.data;
      },
    });
  }
}

/** テスト用。実際のBedrockを呼ばず、固定の解析結果を返す。 */
export class MockReceiptAnalysisService implements ReceiptAnalysisService {
  constructor(
    private readonly fixedResult: RawParsedItems = {
      items: [
        { name: "鶏もも肉", quantity: 1, unit: "pack", confidence: 0.96 },
        { name: "卵", quantity: 1, unit: "pack", confidence: 0.94 },
        { name: "玉ねぎ", quantity: 1, unit: "個", confidence: 0.9 },
      ],
    },
  ) {}

  async analyzeReceiptText(): Promise<RawParsedItems> {
    return this.fixedResult;
  }
}
