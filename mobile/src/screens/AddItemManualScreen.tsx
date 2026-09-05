import React, { useState } from "react";
import { Alert, Button, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../api/client";
import { LabeledTextInput } from "../components/LabeledTextInput";

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
      Alert.alert("登録に失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <LabeledTextInput label="食材名" value={name} onChangeText={setName} placeholder="例: トマト" />
      <LabeledTextInput label="数量" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <LabeledTextInput label="単位" value={unit} onChangeText={setUnit} placeholder="例: 個 / g / ml" />
      <LabeledTextInput
        label="賞味期限(YYYY-MM-DD、任意)"
        value={expiresAt}
        onChangeText={setExpiresAt}
        placeholder="2026-09-20"
      />

      <Button title={submitting ? "登録中..." : "登録する"} onPress={onSubmit} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
});
