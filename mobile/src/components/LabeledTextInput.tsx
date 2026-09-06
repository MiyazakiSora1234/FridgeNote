import React from "react";
import { StyleSheet, Text, View, type TextInputProps } from "react-native";
import { colors, spacing } from "../theme";
import { AppTextInput } from "./AppTextInput";

interface Props extends TextInputProps {
  label: string;
}

/** ラベル + 入力欄のペア。手動登録フォーム・AI認識結果の編集フォームで共通利用する。 */
export function LabeledTextInput({ label, style, ...rest }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <AppTextInput style={style} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
});
