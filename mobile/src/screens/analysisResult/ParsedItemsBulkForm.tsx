import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { ParsedIngredientItem } from "../../types";
import { api } from "../../api/client";
import { AppTextInput } from "../../components/AppTextInput";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfidenceBar } from "../../components/ConfidenceBar";
import { getErrorMessage } from "../../lib/getErrorMessage";
import { colors, spacing, typography } from "../../theme";
import { LowConfidenceNotice } from "./LowConfidenceNotice";

interface Props {
  analysisId: string;
  source: "receipt" | "voice";
  items: ParsedIngredientItem[];
  title: string;
  onDone: () => void;
}

interface ItemDraft extends Omit<ParsedIngredientItem, "quantity"> {
  checked: boolean;
  quantity: string;
}

/**
 * レシートOCR/音声認識、どちらの結果も同じ形(ParsedIngredientItem[])に正規化されて
 * 届くため、確認チェックリスト+一括登録UIをこの1コンポーネントに共通化している
 * (DishConfirmFormと似た「チェックを外したものは登録しない」という考え方だが、
 * 対象が単一の解析ではなく複数件のリストである点が異なる)。
 * confidenceがAI_CONFIDENCE_THRESHOLD未満の項目は、誤登録を避けるため既定で未選択にする。
 */
export function ParsedItemsBulkForm({ analysisId, source, items, title, onDone }: Props) {
  const [drafts, setDrafts] = useState<ItemDraft[]>(
    items.map((item) => ({ ...item, checked: !item.belowConfidenceThreshold, quantity: String(item.quantity) })),
  );
  const [submitting, setSubmitting] = useState(false);

  const update = (index: number, patch: Partial<ItemDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const onConfirm = async () => {
    const selected = drafts.filter((d) => d.checked);
    if (selected.length === 0) {
      Alert.alert("追加する食材を1つ以上選択してください");
      return;
    }
    for (const d of selected) {
      const qty = Number(d.quantity);
      if (!d.name.trim() || !Number.isFinite(qty) || qty <= 0 || !d.unit.trim()) {
        Alert.alert(`${d.name || "項目"} の内容を正しく入力してください`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.createFridgeItemsBulk({
        source,
        sourceAnalysisId: analysisId,
        items: selected.map((d) => ({
          ingredientName: d.name.trim(),
          quantity: Number(d.quantity),
          unit: d.unit.trim(),
        })),
      });
      onDone();
    } catch (e) {
      Alert.alert("追加に失敗しました", getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={typography.heading}>{title}</Text>
      <Text style={[typography.bodyMuted, styles.hint]}>
        内容を確認し、追加したいものだけチェックしてから確定してください。確定するまで在庫は変わりません。
      </Text>

      {drafts.map((d, i) => (
        <Card key={`${d.ingredientId}-${i}`} style={[styles.itemCard, !d.checked && styles.itemCardOff]}>
          <View style={styles.itemHeader}>
            <Switch value={d.checked} onValueChange={(v) => update(i, { checked: v })} trackColor={{ true: colors.primary }} />
            <AppTextInput
              style={styles.nameInput}
              value={d.name}
              onChangeText={(v) => update(i, { name: v })}
              placeholder="食材名"
            />
          </View>
          <ConfidenceBar confidence={d.confidence} />
          <LowConfidenceNotice confidence={d.confidence} />
          {d.checked && (
            <View style={styles.itemInputs}>
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

      <Button title={submitting ? "追加中..." : "すべて追加する"} onPress={onConfirm} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { marginTop: -spacing.sm, marginBottom: spacing.xs },
  itemCard: { gap: spacing.sm },
  itemCardOff: { opacity: 0.55 },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nameInput: { flex: 1, fontWeight: "700" },
  itemInputs: { flexDirection: "row", gap: spacing.sm },
  inputSmall: { flex: 1 },
});
