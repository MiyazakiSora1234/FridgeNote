import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { FridgeItem } from "../types";
import { api } from "../api/client";
import { AppTextInput } from "../components/AppTextInput";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { getErrorMessage } from "../lib/getErrorMessage";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ConsumeManual">;

/**
 * AIを使わず、既存の在庫一覧から数量を自分で入力して減らすための画面。
 * 新しいAPIは作らず、既存の PATCH /v1/fridge/items/:id (quantity更新)をそのまま使う
 * (「使った分を引き算する」という操作自体は既存APIの責務の範囲内のため)。
 */
export function ConsumeManualScreen(_props: Props) {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

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
    const amount = Number(amounts[item.itemId] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("減らす数量を入力してください");
      return;
    }
    if (amount > item.quantity) {
      Alert.alert(`在庫(${item.quantity}${item.unit})を超えています`);
      return;
    }
    try {
      await api.updateFridgeItem(item.itemId, { quantity: item.quantity - amount });
      setAmounts((prev) => ({ ...prev, [item.itemId]: "" }));
      load();
    } catch (e) {
      Alert.alert("更新に失敗しました", getErrorMessage(e));
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
            <Button title="減らす" onPress={() => onConsume(item)} fullWidth={false} style={styles.consumeButton} />
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
