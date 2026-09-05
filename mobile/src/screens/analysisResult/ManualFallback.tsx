import React from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "AnalysisResult">;
  message: string;
}

/** AI解析が失敗/タイムアウトした場合の共通フォールバック表示。手動登録画面への導線を出す。 */
export function ManualFallback({ navigation, message }: Props) {
  return (
    <View style={styles.center}>
      <Text style={styles.message}>{message}</Text>
      <Button title="手動で登録する" onPress={() => navigation.replace("AddItemManual")} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  message: { fontSize: 16, marginTop: 12 },
});
