import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { IngredientCandidate } from "../types";

const DEBOUNCE_MS = 300;

/**
 * 食材名入力のオートコンプリート用。POST /v1/ingredients/search を使う
 * (このAPI自体は以前から実装されていたが、モバイルのどの画面からも
 * 呼ばれておらず未活用だった)。
 * 入力のたびにAPIを叩かないようデバウンスし、入力が空の間は検索しない。
 */
export function useIngredientSuggestions(query: string): IngredientCandidate[] {
  const [suggestions, setSuggestions] = useState<IngredientCandidate[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchIngredients(trimmed, 5);
        if (!cancelled) setSuggestions(res.candidates);
      } catch {
        // サジェストは補助機能のため、失敗しても入力自体は妨げない(エラー表示もしない)。
        if (!cancelled) setSuggestions([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return suggestions;
}
