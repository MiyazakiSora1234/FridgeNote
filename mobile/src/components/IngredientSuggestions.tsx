import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { IngredientCandidate } from "../types";
import { colors, radius, spacing } from "../theme";

// タップで入力値を正式名称に置き換え、表記ゆれによる食材マスターの意図しない増殖を防ぐ。
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
