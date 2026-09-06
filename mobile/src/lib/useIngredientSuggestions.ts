import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { IngredientCandidate } from "../types";

const DEBOUNCE_MS = 300;

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
