import React from "react";
import { StyleSheet, Text } from "react-native";
import { LOW_CONFIDENCE_THRESHOLD } from "../../constants";

export function LowConfidenceNotice({ confidence }: { confidence: number }) {
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
  return <Text style={styles.warning}>認識結果を確認してください(確信度が低い項目です)</Text>;
}

const styles = StyleSheet.create({
  warning: { color: "#E08A00", fontWeight: "600", marginBottom: 8 },
});
