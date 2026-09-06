import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import type { DishAnalysisIngredient } from "../../types";
import { api } from "../../api/client";
import { AppTextInput } from "../../components/AppTextInput";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfidenceBar } from "../../components/ConfidenceBar";
import { getErrorMessage } from "../../lib/getErrorMessage";
import { isNonEmptyUnit, parsePositiveQuantity } from "../../lib/quantityValidation";
import { colors, spacing, typography } from "../../theme";
import { LowConfidenceNotice } from "./LowConfidenceNotice";

interface Props {
  analysisId: string;
  dish: string;
  ingredients: DishAnalysisIngredient[];
  navigation: NativeStackNavigationProp<RootStackParamList, "AnalysisResult">;
}

interface IngredientDraft extends DishAnalysisIngredient {
  checked: boolean;
  quantity: string;
  unit: string;
}

export function DishConfirmForm({ analysisId, dish, ingredients, navigation }: Props) {
  const [drafts, setDrafts] = useState<IngredientDraft[]>(
    ingredients.map((ing) => ({ ...ing, checked: true, quantity: "1", unit: "" })),
  );
  const [submitting, setSubmitting] = useState(false);

  const update = (index: number, patch: Partial<IngredientDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const onConfirm = async () => {
    const selected = drafts.filter((d) => d.checked);
    if (selected.length === 0) {
      Alert.alert("使用した食材を1つ以上選択してください");
      return;
    }
    for (const d of selected) {
      const qty = parsePositiveQuantity(d.quantity);
      if (qty === null || !isNonEmptyUnit(d.unit)) {
        Alert.alert(`${d.name} の数量・単位を正しく入力してください`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.consume({
        sourceAnalysisId: analysisId,
        consumedIngredients: selected.map((d) => ({
          ingredientId: d.ingredientId,
          quantity: parsePositiveQuantity(d.quantity) ?? 0,
          unit: d.unit.trim(),
        })),
      });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("在庫の更新に失敗しました", getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={typography.heading}>🍽️ {dish}</Text>
      <Text style={[typography.bodyMuted, styles.hint]}>
        使ったものだけチェックして、数量を確認してから確定してください。在庫は確定するまで変わりません。
      </Text>

      {drafts.map((d, i) => (
        <Card key={d.ingredientId} style={[styles.ingredientCard, !d.checked && styles.ingredientCardOff]}>
          <View style={styles.ingredientHeader}>
            <Switch
              value={d.checked}
              onValueChange={(v) => update(i, { checked: v })}
              trackColor={{ true: colors.primary }}
            />
            <Text style={styles.ingredientName}>{d.name}</Text>
          </View>
          <ConfidenceBar confidence={d.confidence} />
          <LowConfidenceNotice confidence={d.confidence} />
          {d.checked && (
            <View style={styles.ingredientInputs}>
              <AppTextInput
                style={styles.inputSmall}
                value={d.quantity}
                onChangeText={(v) => update(i, { quantity: v })}
                keyboardType="numeric"
                placeholder="数量"
              />
              <AppTextInput
                style={styles.inputSmall}
                value={d.unit}
                onChangeText={(v) => update(i, { unit: v })}
                placeholder="単位(g/個等)"
              />
            </View>
          )}
        </Card>
      ))}

      <Button title={submitting ? "更新中..." : "使用した食材を確定する"} onPress={onConfirm} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { marginTop: -spacing.sm, marginBottom: spacing.xs },
  ingredientCard: { gap: spacing.sm },
  ingredientCardOff: { opacity: 0.55 },
  ingredientHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ingredientName: { fontSize: 16, fontWeight: "700", flex: 1, color: colors.text },
  ingredientInputs: { flexDirection: "row", gap: spacing.sm },
  inputSmall: { flex: 1 },
});
