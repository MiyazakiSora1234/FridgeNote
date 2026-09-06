import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../api/client";
import { LabeledTextInput } from "../components/LabeledTextInput";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { getErrorMessage } from "../lib/getErrorMessage";
import { colors, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddItemManual">;

export function AddItemManualScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("個");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
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
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("登録に失敗しました", getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <LabeledTextInput label="食材名" value={name} onChangeText={setName} placeholder="例: トマト" />
        <LabeledTextInput label="数量" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
        <LabeledTextInput label="単位" value={unit} onChangeText={setUnit} placeholder="例: 個 / g / ml" />
        <LabeledTextInput
          label="賞味期限(任意)"
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
        />
      </Card>

      <Button title={submitting ? "登録中..." : "登録する"} onPress={onSubmit} loading={submitting} style={styles.submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  submit: { marginTop: spacing.lg },
});
