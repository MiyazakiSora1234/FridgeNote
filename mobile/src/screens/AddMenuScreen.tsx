import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { MenuTile } from "../components/Button";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddMenu">;

export function AddMenuScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.bodyMuted, styles.hint]}>追加したい方法を選んでください。</Text>

      <MenuTile
        emoji="📷"
        label="食材を撮影"
        description="1点をその場で撮影して登録"
        onPress={() => navigation.navigate("Camera", { analysisType: "food" })}
      />
      <MenuTile
        emoji="🧾"
        label="レシートを撮影"
        description="買い物のレシートからまとめて登録"
        onPress={() => navigation.navigate("Camera", { analysisType: "receipt" })}
      />
      <MenuTile
        emoji="🎤"
        label="話して追加"
        description="買った物を声で伝える"
        onPress={() => navigation.navigate("VoiceRecord")}
      />
      <MenuTile
        emoji="✏️"
        label="手動で入力"
        description="1件ずつ自分で入力する"
        onPress={() => navigation.navigate("AddItemManual")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { marginBottom: spacing.xs },
});
