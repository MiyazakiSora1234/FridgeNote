import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../lib/config.js";
import { newId } from "../lib/ids.js";

const s3 = new S3Client({});
const BUCKET_NAME = config.imagesBucketName;
const PRESIGN_EXPIRY_SECONDS = 60;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
};

/** S3キーのプレフィックス(users/{sub}/uploads/ or users/{sub}/audio/)を、メディア種別ごとに分ける。 */
function prefixForContentType(contentType: string): "uploads" | "audio" {
  return contentType.startsWith("audio/") ? "audio" : "uploads";
}

/**
 * ユーザー専用プレフィックス配下にオブジェクトキーを発行し、PUT用Presigned URLを署名する。
 * userIdはAPI側でJWTのsubから取得した値のみを使う(クライアント指定を許さない)。
 * 画像(食材/料理/レシート)・音声(音声入力)のどちらも同じ仕組みで発行する
 * (メディア種別ごとに別のAPI/Lambdaを用意しない)。
 */
export async function createUploadPresignedUrl(
  userId: string,
  contentType: string,
): Promise<{ imageKey: string; uploadUrl: string; expiresIn: number }> {
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "jpg";
  const prefix = prefixForContentType(contentType);
  const imageKey = `users/${userId}/${prefix}/${newId()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: imageKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
  return { imageKey, uploadUrl, expiresIn: PRESIGN_EXPIRY_SECONDS };
}

export async function getObjectAsBase64(
  imageKey: string,
): Promise<{ base64: string; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: imageKey }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`failed to read S3 object: ${imageKey}`);
  return {
    base64: Buffer.from(bytes).toString("base64"),
    contentType: res.ContentType ?? "image/jpeg",
  };
}

/** Transcribeはバイト列を読み込ませず、S3 URIを直接渡して処理させる。 */
export function s3UriFor(key: string): string {
  return `s3://${BUCKET_NAME}/${key}`;
}

const TRANSCRIBE_MEDIA_FORMAT_BY_EXT: Record<string, "mp4" | "wav" | "mp3"> = {
  m4a: "mp4",
  wav: "wav",
  mp3: "mp3",
};

/** S3キーの拡張子からTranscribeのMediaFormatを推定する。 */
export function transcribeMediaFormatFor(key: string): "mp4" | "wav" | "mp3" {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return TRANSCRIBE_MEDIA_FORMAT_BY_EXT[ext] ?? "mp4";
}
