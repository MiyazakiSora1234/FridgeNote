import React, { useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../api/client";

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
      <Text style={styles.label}>食材名</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="例: トマト" />

      <Text style={styles.label}>数量</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />

      <Text style={styles.label}>単位</Text>
      <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="例: 個 / g / ml" />

      <Text style={styles.label}>賞味期限(YYYY-MM-DD、任意)</Text>
      <TextInput style={styles.input} value={expiresAt} onChangeText={setExpiresAt} placeholder="2026-09-20" />

      <Button title={submitting ? "登録中..." : "登録する"} onPress={onSubmit} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
});
