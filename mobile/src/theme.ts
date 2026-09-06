/**
 * 見た目に関する値(色・余白・角丸・文字サイズ)をここに集約する。
 * 各画面が個別に "#ccc" のような色コードを直書きしていると、
 * 統一感が崩れたり、変更時に全画面を探し回る必要が出るため一本化する。
 */
export const colors = {
  primary: "#2E7D32",
  primaryDark: "#1B5E20",
  primaryLight: "#E8F5E9",
  background: "#F6F7F5",
  surface: "#FFFFFF",
  border: "#E3E4E0",
  text: "#1C1C1E",
  textMuted: "#6B6D70",
  textFaint: "#9B9DA0",
  danger: "#D32F2F",
  dangerLight: "#FDECEC",
  warning: "#B26A00",
  warningLight: "#FFF3E0",
  success: "#2E7D32",
  disabled: "#C9CAC7",
  overlay: "rgba(0,0,0,0.55)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

export const typography = {
  title: { fontSize: 26, fontWeight: "700" as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyMuted: { fontSize: 14, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textFaint },
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
};
