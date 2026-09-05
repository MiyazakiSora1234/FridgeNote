import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { ImageAnalysis } from "../types";
import { api } from "../api/client";
import { getErrorMessage } from "../lib/getErrorMessage";
import { ManualFallback } from "./analysisResult/ManualFallback";
import { FoodConfirmForm } from "./analysisResult/FoodConfirmForm";
import { DishConfirmForm } from "./analysisResult/DishConfirmForm";

type Props = NativeStackScreenProps<RootStackParamList, "AnalysisResult">;

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 30; // 約90秒でタイムアウト扱いにする

/**
 * AI解析結果のポーリングと、状態(解析中/失敗/タイムアウト/完了)ごとの画面出し分けだけを担う。
 * 「食材写真の確認フォーム」「料理写真の使用食材確認フォーム」は
 * それぞれ独立したコンポーネント(./analysisResult/)に分離している。
 */
export function AnalysisResultScreen({ route, navigation }: Props) {
  const { analysisId } = route.params;
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api.getAnalysis(analysisId);
        if (cancelled) return;
        setAnalysis(result);
        if (result.status === "pending" || result.status === "processing") {
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            setTimedOut(true);
            return;
          }
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        if (!cancelled) Alert.alert("解析結果の取得に失敗しました", getErrorMessage(e));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  if (timedOut) {
    return <ManualFallback navigation={navigation} message="解析に時間がかかっています。手動で登録してください。" />;
  }

  if (!analysis || analysis.status === "pending" || analysis.status === "processing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>画像を解析しています</Text>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  message: { fontSize: 16, marginTop: 12 },
});
