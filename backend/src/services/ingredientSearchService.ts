import { normalizeIngredientName } from "../lib/normalize.js";
import { loadAllIngredients, loadIngredientIndex } from "./ingredientMaster.js";

export interface IngredientCandidate {
  ingredientId: string;
  name: string;
  category: string;
  /** 0〜1。完全一致=1、Alias完全一致=0.9、部分一致=それ以下。 */
  score: number;
}

/**
 * 食材名の曖昧検索の境界。段階的な検索戦略(完全一致→Alias→正規化部分一致→
 * 将来的にはEmbeddingによる類似検索)を、呼び出し側から透過的に差し替えられるようにする。
 * 5ユーザー・月1,000円以下という制約から、常時稼働のVector DBやOpenSearch Serverlessを
 * MVPでは導入しない。件数が増えて全件ロードでは辛くなった段階で、この
 * インターフェースを満たす別実装(例: BedrockのEmbeddingモデルを使うクラス)に
 * 差し替えるだけで済むようにしてある。
 */
export interface IngredientSearchService {
  search(query: string, limit: number): Promise<IngredientCandidate[]>;
}

export class AliasIngredientSearchService implements IngredientSearchService {
  async search(query: string, limit: number): Promise<IngredientCandidate[]> {
    const normalizedQuery = normalizeIngredientName(query);
    if (!normalizedQuery) return [];

    // 完全一致・Alias完全一致の判定は resolveIngredientId (ingredientMaster.ts) と
    // 同じ索引(loadIngredientIndex)を再利用する(以前は同じ判定ロジックを
    // このファイルへ個別に線形スキャンで実装していた)。
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

    // 正規化名同士の部分一致。「鶏もも」で検索して「鶏もも肉」が候補に出てくるようなケース。
    // 「鶏肉」と「鶏むね肉」のように意味的に別食材のものまで同一視はしない
    // (完全一致・Alias一致のみを同一食材として扱い、これは"候補"止まり)。
    // この部分一致だけは索引化できない(任意の部分文字列同士の比較のため)ので全件スキャンする。
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
