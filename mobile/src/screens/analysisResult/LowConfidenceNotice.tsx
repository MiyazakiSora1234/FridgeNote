import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LOW_CONFIDENCE_THRESHOLD } from "../../constants";
import { colors, radius, spacing } from "../../theme";

export function LowConfidenceNotice({ confidence }: { confidence: number }) {
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>💡 確信度が低めです。内容を確認してください</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  text: { color: colors.warning, fontWeight: "600", fontSize: 13 },
});
