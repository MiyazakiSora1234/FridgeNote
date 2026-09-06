import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Audio } from "expo-av";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { api } from "../api/client";
import { getErrorMessage } from "../lib/getErrorMessage";
import { colors, spacing, typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "VoiceRecord">;

type Phase = "idle" | "recording" | "uploading";

// expo-avのHIGH_QUALITYプリセットはiOS/Androidどちらも拡張子.m4a(AACコーデック)で
// 出力されるため、backend/src/services/s3.ts の拡張子マッピングと一致させてこれを使う。
const AUDIO_CONTENT_TYPE = "audio/m4a";

/** マイクで録音 -> S3へアップロード -> 音声解析ジョブ作成、まで行い、確認画面へ遷移する。 */
export function VoiceRecordScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const recordingRef = useRef<Audio.Recording | null>(null);

  const onStart = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("マイクの使用を許可してください");
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setPhase("recording");
    } catch (e) {
      Alert.alert("録音を開始できませんでした", getErrorMessage(e));
    }
  };

  const onStop = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    setPhase("uploading");
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("録音データを取得できませんでした");

      const { imageKey: audioKey, uploadUrl } = await api.createPresignedUrl(AUDIO_CONTENT_TYPE);
      await api.uploadFileToS3(uploadUrl, uri, AUDIO_CONTENT_TYPE);
      const { analysisId } = await api.createVoiceTranscription(audioKey);
      navigation.replace("VoiceConfirm", { analysisId });
    } catch (e) {
      Alert.alert("アップロードに失敗しました", getErrorMessage(e));
      setPhase("idle");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{phase === "recording" ? "🔴" : "🎤"}</Text>
      <Text style={[typography.heading, styles.title]}>
        {phase === "recording"
          ? "録音中..."
          : phase === "uploading"
            ? "解析を開始しています..."
            : "買った物を話してください"}
      </Text>
      {phase === "idle" && (
        <Text style={[typography.bodyMuted, styles.hint]}>例:「鶏もも肉300グラムと卵6個を追加」</Text>
      )}

      {phase === "uploading" ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spacerTop} />
      ) : (
        <TouchableOpacity
          accessibilityLabel={phase === "recording" ? "録音を終了する" : "録音を開始する"}
          onPress={phase === "recording" ? onStop : onStart}
          style={[styles.micButton, phase === "recording" && styles.micButtonActive]}
        >
          <Text style={styles.micButtonEmoji}>{phase === "recording" ? "⏹" : "🎤"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emoji: { fontSize: 56 },
  title: { textAlign: "center" },
  hint: { textAlign: "center" },
  spacerTop: { marginTop: spacing.xl },
  micButton: {
    marginTop: spacing.xl,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonActive: { backgroundColor: colors.danger },
  micButtonEmoji: { fontSize: 36 },
});
