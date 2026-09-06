import React from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { colors, radius, spacing } from "../theme";

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
