import React, { useState } from "react";
import { Alert, Button, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import type { DishAnalysisIngredient } from "../../types";
import { api } from "../../api/client";
import { AppTextInput } from "../../components/AppTextInput";
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

/**
 * 料理写真のAI認識結果(使用食材候補)を、ユーザーが確認してから在庫を減算するフォーム。
 * AIの推定はあくまで候補であり、チェックを外した食材は在庫から減算されない。
 */
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
      const qty = Number(d.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || !d.unit.trim()) {
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
          quantity: Number(d.quantity),
          unit: d.unit.trim(),
        })),
      });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("在庫の更新に失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.formContent}>
      <Text style={styles.title}>料理: {dish}</Text>
      <Text style={styles.hint}>
        以下は画像から推定された「使用食材候補」です。実際に使用したものだけチェックし、
        数量を確認してから確定してください(在庫は確定するまで変更されません)。
      </Text>

      {drafts.map((d, i) => (
        <View key={d.ingredientId} style={styles.ingredientRow}>
          <View style={styles.ingredientHeader}>
            <Switch value={d.checked} onValueChange={(v) => update(i, { checked: v })} />
            <Text style={styles.ingredientName}>{d.name}</Text>
            <Text style={styles.confidence}>{Math.round(d.confidence * 100)}%</Text>
          </View>
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
        </View>
      ))}

      <Button title={submitting ? "更新中..." : "使用した食材を確定する"} onPress={onConfirm} disabled={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  formContent: { padding: 24, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  hint: { color: "#555", marginBottom: 12 },
  confidence: { color: "#777", fontSize: 12 },
  ingredientRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 12,
  },
  ingredientHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  ingredientName: { fontSize: 16, fontWeight: "600", flex: 1 },
  ingredientInputs: { flexDirection: "row", gap: 8, marginTop: 8 },
  inputSmall: { flex: 1 },
});
