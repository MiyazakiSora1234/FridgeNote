import { normalizeIngredientName } from "../lib/normalize.js";
import { loadAllIngredients, loadIngredientIndex } from "./ingredientMaster.js";

export interface IngredientCandidate {
  ingredientId: string;
  name: string;
  category: string;
  score: number;
}

export interface IngredientSearchService {
  search(query: string, limit: number): Promise<IngredientCandidate[]>;
}

export class AliasIngredientSearchService implements IngredientSearchService {
  async search(query: string, limit: number): Promise<IngredientCandidate[]> {
    const normalizedQuery = normalizeIngredientName(query);
    if (!normalizedQuery) return [];

    const [all, index] = await Promise.all([loadAllIngredients(), loadIngredientIndex()]);
    const candidates: IngredientCandidate[] = [];
    const matchedIds = new Set<string>();

    const exactNameMatch = index.byNormalizedName.get(normalizedQuery);
    if (exactNameMatch) {
      candidates.push({ ingredientId: exactNameMatch.id, name: exactNameMatch.name, category: exactNameMatch.category, score: 1 });
      matchedIds.add(exactNameMatch.id);
    }

    const exactAliasMatch = index.byNormalizedAlias.get(normalizedQuery);
    if (exactAliasMatch && !matchedIds.has(exactAliasMatch.id)) {
      candidates.push({ ingredientId: exactAliasMatch.id, name: exactAliasMatch.name, category: exactAliasMatch.category, score: 0.9 });
      matchedIds.add(exactAliasMatch.id);
    }

    for (const ing of all) {
      if (matchedIds.has(ing.id)) continue;
      const normalizedName = normalizeIngredientName(ing.name);
      if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
        const overlap =
          Math.min(normalizedName.length, normalizedQuery.length) /
          Math.max(normalizedName.length, normalizedQuery.length);
        candidates.push({ ingredientId: ing.id, name: ing.name, category: ing.category, score: 0.5 * overlap });
      }
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
