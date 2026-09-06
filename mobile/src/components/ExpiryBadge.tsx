import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ExpiryStatus } from "../types";
import { colors, radius } from "../theme";

/**
 * ステータスごとの見た目をひとまとめにしておくことで、新しいステータスを追加する際に
 * 複数の別々のRecord(以前はLABEL/BG/TEXT_COLORの3つ)を同時に直す必要がないようにする。
 */
const STYLE_BY_STATUS: Record<ExpiryStatus, { label: string; background: string; textColor: string } | null> = {
  expired: { label: "⚠️ 期限切れ", background: colors.dangerLight, textColor: colors.danger },
  soon: { label: "⏰ まもなく期限", background: colors.warningLight, textColor: colors.warning },
  ok: null,
  none: null,
};

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  const config = STYLE_BY_STATUS[status];
  if (!config) return null;
  return (
    <View style={[styles.badge, { backgroundColor: config.background }]}>
      <Text style={[styles.text, { color: config.textColor }]}>{config.label}</Text>
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
