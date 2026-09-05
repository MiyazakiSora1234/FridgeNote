import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ExpiryStatus } from "../types";

const LABEL: Record<ExpiryStatus, string> = {
  expired: "期限切れ",
  soon: "まもなく期限",
  ok: "",
  none: "",
};

const COLOR: Record<ExpiryStatus, string> = {
  expired: "#B00020",
  soon: "#E08A00",
  ok: "#2E7D32",
  none: "#9E9E9E",
};

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  if (status === "ok" || status === "none") return null;
  return (
    <View style={[styles.badge, { backgroundColor: COLOR[status] }]}>
      <Text style={styles.text}>{LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
