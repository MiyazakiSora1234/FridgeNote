import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../auth/AuthContext";
import { AppTextInput } from "../components/AppTextInput";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

export function SignInScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "サインインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brand}>
        <Text style={styles.emoji}>🧊</Text>
        <Text style={typography.title}>FridgeNote</Text>
        <Text style={typography.bodyMuted}>写真で冷蔵庫を管理しよう</Text>
      </View>

      <Card>
        <AppTextInput
          style={styles.field}
          placeholder="メールアドレス"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <AppTextInput
          style={styles.field}
          placeholder="パスワード"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title={submitting ? "サインイン中..." : "サインイン"} onPress={onSubmit} loading={submitting} />
      </Card>

      <Button title="新規登録はこちら" variant="ghost" onPress={() => navigation.navigate("SignUp")} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background, gap: spacing.lg },
  brand: { alignItems: "center", marginBottom: spacing.sm, gap: 2 },
  emoji: { fontSize: 48, marginBottom: spacing.sm },
  field: { marginBottom: spacing.md },
  error: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
});
