import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ExpiryStatus } from "../types";
import { colors, radius } from "../theme";

const LABEL: Record<ExpiryStatus, string> = {
  expired: "⚠️ 期限切れ",
  soon: "⏰ まもなく期限",
  ok: "",
  none: "",
};

const BG: Record<ExpiryStatus, string> = {
  expired: colors.dangerLight,
  soon: colors.warningLight,
  ok: "transparent",
  none: "transparent",
};

const TEXT_COLOR: Record<ExpiryStatus, string> = {
  expired: colors.danger,
  soon: colors.warning,
  ok: colors.textMuted,
  none: colors.textMuted,
};

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  if (status === "ok" || status === "none") return null;
  return (
    <View style={[styles.badge, { backgroundColor: BG[status] }]}>
      <Text style={[styles.text, { color: TEXT_COLOR[status] }]}>{LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
  },
});
