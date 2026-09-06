import React from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { colors, radius, spacing } from "../theme";

/**
 * 枠線・角丸・パディングの共通スタイルを持つTextInput。
 * 以前は複数の画面がそれぞれ同じスタイルオブジェクトを個別に定義していたため、
 * ここに一本化する(色や余白はtheme.tsから)。
 */
export function AppTextInput({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textFaint} style={[styles.input, style]} {...rest} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
});
