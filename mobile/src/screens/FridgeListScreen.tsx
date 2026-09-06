import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { FridgeItem } from "../types";
import { api } from "../api/client";
import { ActionTile, IconButton } from "../components/Button";
import { Card } from "../components/Card";
import { ExpiryBadge } from "../components/ExpiryBadge";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../lib/getErrorMessage";
import { colors, radius, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "FridgeList">;

export function FridgeListScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(false);

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

  const summary = useMemo(() => {
    const expired = items.filter((i) => i.expiryStatus === "expired").length;
    const soon = items.filter((i) => i.expiryStatus === "soon").length;
    return { expired, soon };
  }, [items]);

  const onDelete = (item: FridgeItem) => {
    Alert.alert("削除しますか?", `${item.name} を冷蔵庫から削除します`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteFridgeItem(item.itemId);
            load();
          } catch (e) {
            Alert.alert("削除に失敗しました", getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>🧊 冷蔵庫</Text>
        <Text style={typography.bodyMuted}>
          {items.length}品
          {summary.expired > 0 && ` ・ 期限切れ ${summary.expired}件`}
          {summary.soon > 0 && ` ・ まもなく期限 ${summary.soon}件`}
        </Text>
      </View>

      <View style={styles.tileRow}>
        <ActionTile emoji="📷" label="食材を撮影" onPress={() => navigation.navigate("Camera", { analysisType: "food" })} />
        <ActionTile emoji="🍳" label="料理から記録" onPress={() => navigation.navigate("Camera", { analysisType: "dish" })} />
        <ActionTile emoji="✏️" label="手動で登録" onPress={() => navigation.navigate("AddItemManual")} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.itemId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🥬</Text>
              <Text style={typography.bodyMuted}>まだ何も登録されていません</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowMain}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.name}</Text>
                <ExpiryBadge status={item.expiryStatus} />
              </View>
              <Text style={typography.bodyMuted}>
                {item.quantity}
                {item.unit} ・ {categoryLabel(item.category)}
              </Text>
              {item.expiresAt && <Text style={styles.expiresAt}>賞味期限 {item.expiresAt}</Text>}
            </View>
            <IconButton emoji="🗑️" accessibilityLabel={`${item.name}を削除`} onPress={() => onDelete(item)} />
          </Card>
        )}
      />

      <TouchableOpacity onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutText}>サインアウト</Text>
      </TouchableOpacity>
    </View>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: "🥦 野菜",
  fruit: "🍎 果物",
  meat: "🥩 肉",
  fish: "🐟 魚",
  dairy: "🥛 乳製品",
  seasoning: "🧂 調味料",
  grain: "🌾 穀物",
  other: "📦 その他",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: spacing.lg },
  header: { marginBottom: spacing.lg, gap: 2 },
  tileRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  listContent: { paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { alignItems: "center", paddingTop: spacing.xxl, gap: spacing.sm },
  emptyEmoji: { fontSize: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowMain: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  expiresAt: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  signOut: { alignItems: "center", paddingVertical: spacing.md },
  signOutText: { color: colors.textFaint, fontSize: 13 },
});
