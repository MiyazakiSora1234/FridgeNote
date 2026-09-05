import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { DishAnalysisIngredient, FoodAnalysisResult, ImageAnalysis } from "../types";
import { api } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AnalysisResult">;

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 30; // 約90秒でタイムアウト扱いにする
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function AnalysisResultScreen({ route, navigation }: Props) {
  const { analysisId } = route.params;
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api.getAnalysis(analysisId);
        if (cancelled) return;
        setAnalysis(result);
        if (result.status === "pending" || result.status === "processing") {
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            setTimedOut(true);
            return;
          }
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        if (!cancelled) Alert.alert("解析結果の取得に失敗しました", e instanceof Error ? e.message : String(e));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  if (timedOut) {
    return <ManualFallback navigation={navigation} message="解析に時間がかかっています。手動で登録してください。" />;
  }

  if (!analysis || analysis.status === "pending" || analysis.status === "processing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>画像を解析しています</Text>
      </View>
    );
  }

  if (analysis.status === "failed") {
    return <ManualFallback navigation={navigation} message="画像を解析できませんでした。手動で登録してください。" />;
  }

  if (!analysis.result) {
    return <ManualFallback navigation={navigation} message="解析結果を取得できませんでした。手動で登録してください。" />;
  }

  if (analysis.result.kind === "food") {
    return <FoodConfirmForm analysisId={analysisId} result={analysis.result} navigation={navigation} />;
  }

  return <DishConfirmForm analysisId={analysisId} dish={analysis.result.dish} ingredients={analysis.result.ingredients} navigation={navigation} />;
}

function ManualFallback({
  navigation,
  message,
}: {
  navigation: Props["navigation"];
  message: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.message}>{message}</Text>
      <Button title="手動で登録する" onPress={() => navigation.replace("AddItemManual")} />
    </View>
  );
}

function LowConfidenceNotice({ confidence }: { confidence: number }) {
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
  return <Text style={styles.warning}>認識結果を確認してください(確信度が低い項目です)</Text>;
}

function FoodConfirmForm({
  analysisId,
  result,
  navigation,
}: {
  analysisId: string;
  result: FoodAnalysisResult;
  navigation: Props["navigation"];
}) {
  const [name, setName] = useState(result.name);
  const [quantity, setQuantity] = useState(String(result.quantity));
  const [unit, setUnit] = useState(result.unit);
  const [expiresAt, setExpiresAt] = useState(result.expiresAtEstimate ?? "");
  const [submitting, setSubmitting] = useState(false);

  const onConfirm = async () => {
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
        sourceAnalysisId: analysisId,
      });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("登録に失敗しました", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.formContent}>
      <Text style={styles.title}>認識結果を確認してください</Text>
      <Text style={styles.hint}>AIの認識結果です。内容を確認・修正してから登録してください。</Text>
      <LowConfidenceNotice confidence={result.confidence} />
      <Text style={styles.confidence}>確信度: {Math.round(result.confidence * 100)}%</Text>

      <Text style={styles.label}>食材名</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>数量</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />

      <Text style={styles.label}>単位</Text>
      <TextInput style={styles.input} value={unit} onChangeText={setUnit} />

      <Text style={styles.label}>賞味期限(推定・修正可)</Text>
      <TextInput style={styles.input} value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD" />

      <Button title={submitting ? "登録中..." : "この内容で登録する"} onPress={onConfirm} disabled={submitting} />
    </ScrollView>
  );
}

interface IngredientDraft extends DishAnalysisIngredient {
  checked: boolean;
  quantity: string;
  unit: string;
}

function DishConfirmForm({
  analysisId,
  dish,
  ingredients,
  navigation,
}: {
  analysisId: string;
  dish: string;
  ingredients: DishAnalysisIngredient[];
  navigation: Props["navigation"];
}) {
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
              <TextInput
                style={[styles.input, styles.inputSmall]}
                value={d.quantity}
                onChangeText={(v) => update(i, { quantity: v })}
                keyboardType="numeric"
                placeholder="数量"
              />
              <TextInput
                style={[styles.input, styles.inputSmall]}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  message: { fontSize: 16, marginTop: 12 },
  formContent: { padding: 24, gap: 4 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  hint: { color: "#555", marginBottom: 12 },
  warning: { color: "#E08A00", fontWeight: "600", marginBottom: 8 },
  confidence: { color: "#777", fontSize: 12 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
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
