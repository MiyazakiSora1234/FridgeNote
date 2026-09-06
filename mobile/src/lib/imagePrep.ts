import * as ImageManipulator from "expo-image-manipulator";

// S3アップロード容量とBedrock送信量を抑えるための圧縮(コスト要件: 月1,000円以下)。
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

export async function prepareImageForUpload(
  uri: string,
): Promise<{ uri: string; contentType: "image/jpeg" }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: result.uri, contentType: "image/jpeg" };
}
