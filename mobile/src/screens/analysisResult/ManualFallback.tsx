import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { Button } from "../../components/Button";
import { colors, spacing, typography } from "../../theme";

interface Props {
  // 特定の画面(AnalysisResult)に縛らず汎用的なnavigation型にすることで、
  // 音声解析の確認画面(VoiceConfirmScreen)からも同じフォールバック表示を再利用できるようにする。
  navigation: NativeStackNavigationProp<RootStackParamList>;
  message: string;
}

/** AI解析が失敗/タイムアウトした場合の共通フォールバック表示。手動登録画面への導線を出す。 */
export function ManualFallback({ navigation, message }: Props) {
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>😕</Text>
      <Text style={[typography.body, styles.message]}>{message}</Text>
      <Button title="手動で登録する" onPress={() => navigation.replace("AddItemManual")} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emoji: { fontSize: 40, marginBottom: spacing.md },
  message: { textAlign: "center", marginBottom: spacing.lg },
  button: { minWidth: 200 },
});
