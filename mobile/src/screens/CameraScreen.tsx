import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { prepareImageForUpload } from "../lib/imagePrep";
import { getErrorMessage } from "../lib/getErrorMessage";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { colors, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

export function CameraScreen({ route, navigation }: Props) {
  const { analysisType } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <View style={[styles.container, styles.center]} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, styles.permissionScreen]}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>カメラの使用を許可してください</Text>
        {permission.canAskAgain ? (
          <Button title="許可する" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
        ) : (
          <Text style={styles.permissionHint}>
            設定アプリ → FridgeNote → カメラ を有効にしてから、もう一度お試しください。
          </Text>
        )}
      </View>
    );
  }

  const onCapture = async () => {
    if (!cameraRef.current || uploading) return;
    setUploading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error("撮影に失敗しました");

      const prepared = await prepareImageForUpload(photo.uri);
      const { imageKey, uploadUrl } = await api.createPresignedUrl(prepared.contentType);
      await api.uploadImageToS3(uploadUrl, prepared.uri, prepared.contentType);
      const { analysisId } = await api.createAnalysis(imageKey, analysisType);

      navigation.replace("AnalysisResult", { analysisId, analysisType });
    } catch (e) {
      Alert.alert("アップロードに失敗しました", getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <View style={styles.hintWrap}>
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>
            {analysisType === "food" ? "🥦 食材を撮影してください" : "🍽️ 料理を撮影してください"}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        {uploading ? (
          <View style={styles.shutterOuter}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : (
          <TouchableOpacity accessibilityLabel="撮影する" onPress={onCapture} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  permissionScreen: { backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  permissionEmoji: { fontSize: 48, marginBottom: spacing.md },
  permissionTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  permissionHint: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  hintWrap: { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  hintPill: {
    backgroundColor: colors.overlay,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  hintText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#fff",
  },
});
