import React, { useCallback, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { FridgeItem } from "../types";
import { api } from "../api/client";
import { ExpiryBadge } from "../components/ExpiryBadge";
import { useAuth } from "../auth/AuthContext";

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
      Alert.alert("取得に失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onDelete = (item: FridgeItem) => {
    Alert.alert("削除しますか?", `${item.name} を冷蔵庫から削除します`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          await api.deleteFridgeItem(item.itemId);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button title="食材を撮影して登録" onPress={() => navigation.navigate("Camera", { analysisType: "food" })} />
        <Button title="料理を撮影して消費登録" onPress={() => navigation.navigate("Camera", { analysisType: "dish" })} />
        <Button title="手動で登録" onPress={() => navigation.navigate("AddItemManual")} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.itemId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>冷蔵庫に食材が登録されていません</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onLongPress={() => onDelete(item)}>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>
                {item.quantity}
                {item.unit} ・ {item.category}
              </Text>
              {item.expiresAt && <Text style={styles.detail}>賞味期限: {item.expiresAt}</Text>}
            </View>
            <ExpiryBadge status={item.expiryStatus} />
          </TouchableOpacity>
        )}
      />

      <Button title="サインアウト" color="#888" onPress={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48 },
  actions: { gap: 8, marginBottom: 16 },
  empty: { textAlign: "center", marginTop: 32, color: "#777" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowMain: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  detail: { fontSize: 13, color: "#666" },
});
