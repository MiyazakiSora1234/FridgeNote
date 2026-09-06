import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../api/client";
import { LabeledTextInput } from "../components/LabeledTextInput";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { IngredientSuggestions } from "../components/IngredientSuggestions";
import { getErrorMessage } from "../lib/getErrorMessage";
import { isNonEmptyUnit, parsePositiveQuantity } from "../lib/quantityValidation";
import { useIngredientSuggestions } from "../lib/useIngredientSuggestions";
import { colors, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddItemManual">;

export function AddItemManualScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("個");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const suggestions = useIngredientSuggestions(name);

  const onSubmit = async () => {
    const quantityNum = parsePositiveQuantity(quantity);
    if (!name.trim() || quantityNum === null || !isNonEmptyUnit(unit)) {
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
        <IngredientSuggestions suggestions={suggestions} onSelect={setName} />
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
