import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import type { AnalysisType } from "../types";
import { prepareImageForUpload } from "../lib/imagePrep";
import { getErrorMessage } from "../lib/getErrorMessage";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { colors, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

async function uploadAndAnalyze(
  uri: string,
  analysisType: AnalysisType,
  onDone: (analysisId: string) => void,
): Promise<void> {
  const prepared = await prepareImageForUpload(uri);
  const { imageKey, uploadUrl } = await api.createPresignedUrl(prepared.contentType);
  await api.uploadFileToS3(uploadUrl, prepared.uri, prepared.contentType);
  const { analysisId } = await api.createAnalysis(imageKey, analysisType);
  onDone(analysisId);
}

function hintTextFor(analysisType: AnalysisType): string {
  switch (analysisType) {
    case "food":
      return "🥦 食材を撮影してください";
    case "dish":
      return "🍽️ 料理を撮影してください";
    case "receipt":
      return "🧾 レシートを撮影してください";
  }
}

export function CameraScreen({ route, navigation }: Props) {
  const { analysisType } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const goToResult = (analysisId: string) => navigation.replace("AnalysisResult", { analysisId });

  const onCapture = async () => {
    if (!cameraRef.current || uploading) return;
    setUploading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error("撮影に失敗しました");
      await uploadAndAnalyze(photo.uri, analysisType, goToResult);
    } catch (e) {
      Alert.alert("アップロードに失敗しました", getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const onPickFromLibrary = async () => {
    if (uploading) return;
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryPermission.granted) {
      Alert.alert("写真ライブラリへのアクセスを許可してください");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      await uploadAndAnalyze(result.assets[0].uri, analysisType, goToResult);
    } catch (e) {
      Alert.alert("アップロードに失敗しました", getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

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
        <Button
          title="🖼️ アルバムから選ぶ"
          variant="ghost"
          onPress={onPickFromLibrary}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <View style={styles.hintWrap}>
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>{hintTextFor(analysisType)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        {uploading ? (
          <View style={styles.shutterOuter}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : (
          <>
            <TouchableOpacity
              accessibilityLabel="アルバムから選ぶ"
              onPress={onPickFromLibrary}
              style={styles.libraryButton}
            >
              <Text style={styles.libraryEmoji}>🖼️</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="撮影する" onPress={onCapture} style={styles.shutterOuter}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <View style={styles.libraryButtonSpacer} />
          </>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
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
  libraryButton: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryButtonSpacer: { width: 52, height: 52 },
  libraryEmoji: { fontSize: 24 },
});
