import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Button, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { prepareImageForUpload } from "../lib/imagePrep";
import { getErrorMessage } from "../lib/getErrorMessage";
import { api } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

export function CameraScreen({ route, navigation }: Props) {
  const { analysisType } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>カメラの使用を許可してください</Text>
        <Button title="許可する" onPress={requestPermission} />
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
      <View style={styles.controls}>
        <Text style={styles.hint}>
          {analysisType === "food" ? "食材を撮影してください" : "料理を撮影してください"}
        </Text>
        {uploading ? (
          <ActivityIndicator size="large" />
        ) : (
          <Button title="撮影する" onPress={onCapture} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  controls: { padding: 24, alignItems: "center", gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  message: { marginBottom: 12 },
  hint: { fontSize: 16, fontWeight: "600" },
});
