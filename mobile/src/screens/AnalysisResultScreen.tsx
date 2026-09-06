import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { ImageAnalysis } from "../types";
import { api } from "../api/client";
import { usePollingAnalysis } from "../lib/usePollingAnalysis";
import { ManualFallback } from "./analysisResult/ManualFallback";
import { FoodConfirmForm } from "./analysisResult/FoodConfirmForm";
import { DishConfirmForm } from "./analysisResult/DishConfirmForm";
import { ParsedItemsBulkForm } from "./analysisResult/ParsedItemsBulkForm";
import { colors, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AnalysisResult">;

export function AnalysisResultScreen({ route, navigation }: Props) {
  const { analysisId } = route.params;
  const { data: analysis, timedOut } = usePollingAnalysis<ImageAnalysis>(
    () => api.getAnalysis(analysisId),
    [analysisId],
  );

  if (timedOut) {
    return <ManualFallback navigation={navigation} message="解析に時間がかかっています。手動で登録してください。" />;
  }

  if (!analysis || analysis.status === "pending" || analysis.status === "processing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typography.body, styles.message]}>🔍 画像を解析しています</Text>
        <Text style={typography.bodyMuted}>少々お待ちください...</Text>
      </View>
    );
  }

  if (analysis.status === "failed") {
    return <ManualFallback navigation={navigation} message="画像を解析できませんでした。手動で登録してください。" />;
  }

  if (!analysis.result) {
    return <ManualFallback navigation={navigation} message="解析結果を取得できませんでした。手動で登録してください。" />;
  }

  if (analysis.result.kind === "food") {
    return <FoodConfirmForm analysisId={analysisId} result={analysis.result} navigation={navigation} />;
  }

  if (analysis.result.kind === "receipt") {
    return (
      <ParsedItemsBulkForm
        analysisId={analysisId}
        source="receipt"
        items={analysis.result.items}
        title="🧾 レシートの読み取り結果"
        onDone={() => navigation.popToTop()}
      />
    );
  }

  return (
    <DishConfirmForm
      analysisId={analysisId}
      dish={analysis.result.dish}
      ingredients={analysis.result.ingredients}
      navigation={navigation}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 6,
    backgroundColor: colors.background,
  },
  message: { marginTop: 12, fontWeight: "600" },
});
