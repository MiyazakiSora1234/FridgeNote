import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { IngredientCandidate } from "../types";
import { colors, radius, spacing } from "../theme";

/**
 * 食材名入力欄の下に出す、既存の食材マスターからのサジェストチップ。
 * タップすると入力欄の値をそのサジェストの正式名称で置き換える(誤字・表記ゆれの混入や、
 * それによる食材マスターの意図しない新規増殖(docs/architecture.md参照)を防ぐ狙い)。
 */
export function IngredientSuggestions({
  suggestions,
  onSelect,
}: {
  suggestions: IngredientCandidate[];
  onSelect: (name: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.row}>
      {suggestions.map((s) => (
        <TouchableOpacity key={s.ingredientId} style={styles.chip} onPress={() => onSelect(s.name)}>
          <Text style={styles.chipText}>{s.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: -spacing.xs, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.primaryDark },
});
