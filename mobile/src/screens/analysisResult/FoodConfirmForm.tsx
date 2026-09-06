import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import type { FoodAnalysisResult } from "../../types";
import { api } from "../../api/client";
import { LabeledTextInput } from "../../components/LabeledTextInput";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfidenceBar } from "../../components/ConfidenceBar";
import { getErrorMessage } from "../../lib/getErrorMessage";
import { colors, spacing, typography } from "../../theme";
import { LowConfidenceNotice } from "./LowConfidenceNotice";

interface Props {
  analysisId: string;
  result: FoodAnalysisResult;
  navigation: NativeStackNavigationProp<RootStackParamList, "AnalysisResult">;
}

/** 食材写真のAI認識結果を、ユーザーが確認・修正してから冷蔵庫へ登録するフォーム。 */
export function FoodConfirmForm({ analysisId, result, navigation }: Props) {
  const [name, setName] = useState(result.name);
  const [quantity, setQuantity] = useState(String(result.quantity));
  const [unit, setUnit] = useState(result.unit);
  const [expiresAt, setExpiresAt] = useState(result.expiresAtEstimate ?? "");
  const [submitting, setSubmitting] = useState(false);

  const onConfirm = async () => {
    const quantityNum = Number(quantity);
    if (!name.trim() || !Number.isFinite(quantityNum) || quantityNum <= 0 || !unit.trim()) {
      Alert.alert("入力内容を確認してください");
      return;
    }
    setSubmitting(true);
    try {
      await api.createFridgeItem({
        ingredientName: name.trim(),
        quantity: quantityNum,
        unit: unit.trim(),
        expiresAt: expiresAt.trim() || null,
        sourceAnalysisId: analysisId,
      });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("登録に失敗しました", getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={typography.heading}>認識結果を確認してください</Text>
      <Text style={[typography.bodyMuted, styles.hint]}>内容を確認・修正してから登録してください。</Text>

      <Card style={styles.card}>
        <LowConfidenceNotice confidence={result.confidence} />
        <ConfidenceBar confidence={result.confidence} />

        <LabeledTextInput label="食材名" value={name} onChangeText={setName} style={styles.gap} />
        <LabeledTextInput label="数量" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
        <LabeledTextInput label="単位" value={unit} onChangeText={setUnit} />
        <LabeledTextInput
          label="賞味期限(推定・修正可)"
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
        />
      </Card>

      <Button title={submitting ? "登録中..." : "この内容で登録する"} onPress={onConfirm} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  hint: { marginTop: -spacing.sm },
  card: { gap: 2 },
  gap: { marginTop: spacing.sm },
});
