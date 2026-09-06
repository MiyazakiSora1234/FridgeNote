import { config } from "../lib/config.js";
import type { RawParsedItems } from "../schemas/aiSchemas.js";
import type { ParsedIngredientItem } from "../types/index.js";
import { resolveIngredientId } from "./ingredientMaster.js";

/**
 * レシートOCR・音声認識、どちらのAI結果(RawParsedItems)も同じ形に正規化する。
 * 各食材名をIngredient Masterへ正規化し、confidenceがAI_CONFIDENCE_THRESHOLDを
 * 下回るかどうかをバックエンド側で判定してから返す(モバイル側でハードコードした
 * 閾値と再実装しない。モバイルの確認画面はこのフラグを見てチェックボックスの
 * 初期状態を決める)。
 */
export async function normalizeParsedItems(raw: RawParsedItems): Promise<ParsedIngredientItem[]> {
  return Promise.all(
    raw.items.map(async (item): Promise<ParsedIngredientItem> => {
      const resolved = await resolveIngredientId(item.name);
      return {
        name: resolved.name,
        ingredientId: resolved.ingredientId,
        quantity: item.quantity,
        unit: item.unit,
        confidence: item.confidence,
        belowConfidenceThreshold: item.confidence < config.aiConfidenceThreshold,
      };
    }),
  );
}
