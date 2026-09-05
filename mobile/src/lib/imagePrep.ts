import * as ImageManipulator from "expo-image-manipulator";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

/**
 * S3アップロード容量とBedrockへ送信する画像サイズを抑えるため、
 * 撮影直後に長辺1280px・JPEG品質0.7へリサイズ圧縮する。
 * (コスト要件: 月1,000円以下を達成するための重要な最適化ポイント)
 */
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
