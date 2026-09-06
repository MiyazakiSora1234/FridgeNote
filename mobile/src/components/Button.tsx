import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

/**
 * React Native標準の<Button>は角丸・余白・配色を一切カスタマイズできず
 * プラットフォームデフォルトの見た目になってしまうため、代わりにこれを使う。
 */
export function Button({ title, onPress, variant = "primary", loading, disabled, style, fullWidth = true }: Props) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? colors.primary : "#fff"} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

/** アイコン(絵文字)+短いラベルの、正方形に近いタイル型ボタン。主要アクションの入口に使う。 */
export function ActionTile({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={tileStyles.tile}>
      <Text style={tileStyles.emoji}>{emoji}</Text>
      <Text style={tileStyles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * アイコン+タイトル+説明文を横並びにした、リスト型のメニュー項目ボタン。
 * ActionTile(正方形・アイコン+短いラベルのみ)より情報量が多い選択肢
 * (追加/減らすメニューの各手段の説明)を出すのに使う。
 */
export function MenuTile({
  emoji,
  label,
  description,
  onPress,
}: {
  emoji: string;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={menuTileStyles.tile}>
      <Text style={menuTileStyles.emoji}>{emoji}</Text>
      <View style={menuTileStyles.textWrap}>
        <Text style={menuTileStyles.label}>{label}</Text>
        <Text style={menuTileStyles.description}>{description}</Text>
      </View>
      <Text style={menuTileStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

/** アイコンのみの小さな丸ボタン(一覧行の削除ボタン等)。 */
export function IconButton({
  emoji,
  onPress,
  accessibilityLabel,
}: {
  emoji: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={iconButtonStyles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={iconButtonStyles.emoji}>{emoji}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: "600" },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: "transparent" },
});

const labelStyles = StyleSheet.create({
  primary: { color: "#fff" },
  secondary: { color: colors.primaryDark },
  danger: { color: "#fff" },
  ghost: { color: colors.textMuted },
});

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  emoji: { fontSize: 26 },
  label: { fontSize: 12, fontWeight: "600", color: colors.text, textAlign: "center" },
});

const menuTileStyles = StyleSheet.create({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emoji: { fontSize: 28 },
  textWrap: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: "700", color: colors.text },
  description: { fontSize: 13, color: colors.textMuted },
  chevron: { fontSize: 22, color: colors.textFaint },
});

const iconButtonStyles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  emoji: { fontSize: 15 },
});

export const ButtonRow = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: "row", gap: spacing.sm }}>{children}</View>
);
