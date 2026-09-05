import React, { useState } from "react";
import { Alert, Button, ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import type { FoodAnalysisResult } from "../../types";
import { api } from "../../api/client";
import { LabeledTextInput } from "../../components/LabeledTextInput";
import { getErrorMessage } from "../../lib/getErrorMessage";
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
    <ScrollView style={styles.container} contentContainerStyle={styles.formContent}>
      <Text style={styles.title}>認識結果を確認してください</Text>
      <Text style={styles.hint}>AIの認識結果です。内容を確認・修正してから登録してください。</Text>
      <LowConfidenceNotice confidence={result.confidence} />
      <Text style={styles.confidence}>確信度: {Math.round(result.confidence * 100)}%</Text>

      <LabeledTextInput label="食材名" value={name} onChangeText={setName} />
      <LabeledTextInput label="数量" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <LabeledTextInput label="単位" value={unit} onChangeText={setUnit} />
      <LabeledTextInput
        label="賞味期限(推定・修正可)"
        value={expiresAt}
        onChangeText={setExpiresAt}
        placeholder="YYYY-MM-DD"
      />

      <Button title={submitting ? "登録中..." : "この内容で登録する"} onPress={onConfirm} disabled={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  formContent: { padding: 24, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  hint: { color: "#555", marginBottom: 12 },
  confidence: { color: "#777", fontSize: 12 },
});
