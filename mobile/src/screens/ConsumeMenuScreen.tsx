import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { MenuTile } from "../components/Button";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ConsumeMenu">;

export function ConsumeMenuScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.bodyMuted, styles.hint]}>減らしたい方法を選んでください。</Text>

      <MenuTile
        emoji="🍽️"
        label="料理から減らす"
        description="食べた料理を撮影して使った分を確認"
        onPress={() => navigation.navigate("Camera", { analysisType: "dish" })}
      />
      <MenuTile
        emoji="✏️"
        label="手動で減らす"
        description="数量を自分で入力して減らす"
        onPress={() => navigation.navigate("ConsumeManual")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { marginBottom: spacing.xs },
});
