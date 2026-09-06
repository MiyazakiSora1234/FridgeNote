import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { ParsedIngredientItem } from "../../types";
import { api } from "../../api/client";
import { AppTextInput } from "../../components/AppTextInput";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfidenceBar } from "../../components/ConfidenceBar";
import { IngredientSuggestions } from "../../components/IngredientSuggestions";
import { getErrorMessage } from "../../lib/getErrorMessage";
import { isNonEmptyUnit, parsePositiveQuantity } from "../../lib/quantityValidation";
import { useIngredientSuggestions } from "../../lib/useIngredientSuggestions";
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
      const qty = parsePositiveQuantity(d.quantity);
      if (!d.name.trim() || qty === null || !isNonEmptyUnit(d.unit)) {
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
          quantity: parsePositiveQuantity(d.quantity) ?? 0,
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
        <ParsedItemRow key={`${d.ingredientId}-${i}`} draft={d} onChange={(patch) => update(i, patch)} />
      ))}

      <Button title={submitting ? "追加中..." : "すべて追加する"} onPress={onConfirm} loading={submitting} />
    </ScrollView>
  );
}

function ParsedItemRow({ draft, onChange }: { draft: ItemDraft; onChange: (patch: Partial<ItemDraft>) => void }) {
  const suggestions = useIngredientSuggestions(draft.name);

  return (
    <Card style={[styles.itemCard, !draft.checked && styles.itemCardOff]}>
      <View style={styles.itemHeader}>
        <Switch
          value={draft.checked}
          onValueChange={(v) => onChange({ checked: v })}
          trackColor={{ true: colors.primary }}
        />
        <AppTextInput
          style={styles.nameInput}
          value={draft.name}
          onChangeText={(v) => onChange({ name: v })}
          placeholder="食材名"
        />
      </View>
      <IngredientSuggestions suggestions={suggestions} onSelect={(name) => onChange({ name })} />
      <ConfidenceBar confidence={draft.confidence} />
      <LowConfidenceNotice confidence={draft.confidence} />
      {draft.checked && (
        <View style={styles.itemInputs}>
          <AppTextInput
            style={styles.inputSmall}
            value={draft.quantity}
            onChangeText={(v) => onChange({ quantity: v })}
            keyboardType="numeric"
            placeholder="数量"
          />
          <AppTextInput
            style={styles.inputSmall}
            value={draft.unit}
            onChangeText={(v) => onChange({ unit: v })}
            placeholder="単位(g/個等)"
          />
        </View>
      )}
    </Card>
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
