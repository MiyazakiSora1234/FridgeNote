import React from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

/**
 * 枠線・角丸・パディングの共通スタイルを持つTextInput。
 * 以前は4つの画面(SignIn/SignUp/AddItemManual/AnalysisResult)がそれぞれ
 * 同じスタイルオブジェクトを個別に定義していたため、ここに一本化する。
 */
export function AppTextInput({ style, ...rest }: TextInputProps) {
  return <TextInput style={[styles.input, style]} {...rest} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
});
