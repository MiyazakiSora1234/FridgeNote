import { RawParsedItemsSchema, type RawParsedItems } from "../../schemas/aiSchemas.js";
import { AiResponseInvalidError } from "./errors.js";

/**
 * Bedrockのtool_use出力を RawParsedItems としてバリデーションする。
 * レシート(ReceiptAnalysisService)・音声(VoiceAnalysisService)はどちらも
 * 同じ形(ParsedIngredientItemの元になる生データ)に構造化してもらうため、
 * このparseロジックを共有する(以前は2ファイルへ全く同じ実装をコピーしていた)。
 */
export function parseRawParsedItemsOrThrow(raw: unknown): RawParsedItems {
  const result = RawParsedItemsSchema.safeParse(raw);
  if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
  return result.data;
}
