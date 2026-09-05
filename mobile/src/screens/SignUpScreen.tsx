import React, { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { confirmSignUp, signUp } from "../auth/cognito";

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

export function SignUpScreen({ navigation }: Props) {
  const [step, setStep] = useState<"register" | "confirm">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onRegister = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email.trim(), password);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await confirmSignUp(email.trim(), code.trim());
      navigation.replace("SignIn");
    } catch (e) {
      setError(e instanceof Error ? e.message : "確認コードが正しくありません");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "confirm") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>確認コードを入力</Text>
        <Text style={styles.hint}>{email} に届いた確認コードを入力してください</Text>
        <TextInput
          style={styles.input}
          placeholder="確認コード"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title={submitting ? "確認中..." : "確認する"} onPress={onConfirm} disabled={submitting} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>新規登録</Text>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="パスワード(8文字以上)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={submitting ? "登録中..." : "登録する"} onPress={onRegister} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  hint: { marginBottom: 16, textAlign: "center", color: "#555" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  error: { color: "#B00020", marginBottom: 12 },
});
