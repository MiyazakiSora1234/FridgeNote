import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { VoiceAnalysis } from "../types";
import { api } from "../api/client";
import { usePollingAnalysis } from "../lib/usePollingAnalysis";
import { ManualFallback } from "./analysisResult/ManualFallback";
import { ParsedItemsBulkForm } from "./analysisResult/ParsedItemsBulkForm";
import { colors, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "VoiceConfirm">;

export function VoiceConfirmScreen({ route, navigation }: Props) {
  const { analysisId } = route.params;
  const { data: analysis, timedOut } = usePollingAnalysis<VoiceAnalysis>(
    () => api.getVoiceTranscription(analysisId),
    [analysisId],
  );

  if (timedOut) {
    return <ManualFallback navigation={navigation} message="解析に時間がかかっています。手動で登録してください。" />;
  }

  if (!analysis || analysis.status === "pending" || analysis.status === "processing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typography.body, styles.message]}>🎤 音声を解析しています</Text>
        <Text style={typography.bodyMuted}>少々お待ちください...</Text>
      </View>
    );
  }

  if (analysis.status === "failed" || !analysis.result) {
    return <ManualFallback navigation={navigation} message="音声を認識できませんでした。手動で登録してください。" />;
  }

  return (
    <ParsedItemsBulkForm
      analysisId={analysisId}
      source="voice"
      items={analysis.result.items}
      title="🎤 聞き取った内容"
      onDone={() => navigation.popToTop()}
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
