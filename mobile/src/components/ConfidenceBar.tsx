import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";
import { LOW_CONFIDENCE_THRESHOLD } from "../constants";

export function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const isLow = confidence < LOW_CONFIDENCE_THRESHOLD;
  const barColor = isLow ? colors.warning : colors.success;

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.percent, { color: barColor }]}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
  percent: { fontSize: 12, fontWeight: "700", width: 38, textAlign: "right" },
});
