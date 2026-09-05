import React from "react";
import { StyleSheet, Text, View, type TextInputProps } from "react-native";
import { AppTextInput } from "./AppTextInput";

interface Props extends TextInputProps {
  label: string;
}

/** ラベル + 入力欄のペア。手動登録フォーム・AI認識結果の編集フォームで共通利用する。 */
export function LabeledTextInput({ label, style, ...rest }: Props) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <AppTextInput style={style} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
});
