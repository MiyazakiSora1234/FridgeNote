import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { FridgeItem } from "../types";
import { api, ApiClientError } from "../api/client";
import { AppTextInput } from "../components/AppTextInput";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { getErrorMessage } from "../lib/getErrorMessage";
import { parsePositiveQuantity } from "../lib/quantityValidation";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ConsumeManual">;

export function ConsumeManualScreen(_props: Props) {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listFridgeItems();
      setItems(res.items);
    } catch (e) {
      Alert.alert("取得に失敗しました", getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onConsume = async (item: FridgeItem) => {
    if (submittingItemId) return;
    const amount = parsePositiveQuantity(amounts[item.itemId] ?? "");
    if (amount === null) {
      Alert.alert("減らす数量を入力してください");
      return;
    }
    if (amount > item.quantity) {
      Alert.alert(`在庫(${item.quantity}${item.unit})を超えています`);
      return;
    }
    setSubmittingItemId(item.itemId);
    try {
      // decrementByはサーバー側で原子的に減算されるため、他端末との同時実行でも減算が失われない。
      await api.updateFridgeItem(item.itemId, { decrementBy: amount });
      setAmounts((prev) => ({ ...prev, [item.itemId]: "" }));
      await load();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) {
        Alert.alert("在庫が変わっていたため減らせませんでした", "最新の在庫を確認してください");
        await load();
        return;
      }
      Alert.alert("更新に失敗しました", getErrorMessage(e));
    } finally {
      setSubmittingItemId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[typography.bodyMuted, styles.hint]}>減らす数量を入力して確定してください。</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.itemId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🥬</Text>
              <Text style={typography.bodyMuted}>在庫がありません</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={typography.bodyMuted}>
                在庫: {item.quantity}
                {item.unit}
              </Text>
            </View>
            <AppTextInput
              style={styles.amountInput}
              keyboardType="numeric"
              placeholder="数量"
              value={amounts[item.itemId] ?? ""}
              onChangeText={(v) => setAmounts((prev) => ({ ...prev, [item.itemId]: v }))}
            />
            <Button
              title="減らす"
              onPress={() => onConsume(item)}
              loading={submittingItemId === item.itemId}
              disabled={submittingItemId !== null}
              fullWidth={false}
              style={styles.consumeButton}
            />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  hint: { marginBottom: spacing.sm },
  listContent: { paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { alignItems: "center", paddingTop: spacing.xxl, gap: spacing.sm },
  emptyEmoji: { fontSize: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  amountInput: { width: 72, textAlign: "center", paddingHorizontal: spacing.sm },
  consumeButton: { paddingHorizontal: spacing.md },
});
