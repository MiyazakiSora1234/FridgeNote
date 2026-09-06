import { config } from "../lib/config.js";
import type { RawParsedItems } from "../schemas/aiSchemas.js";
import type { ParsedIngredientItem } from "../types/index.js";
import { resolveIngredientId } from "./ingredientMaster.js";

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
