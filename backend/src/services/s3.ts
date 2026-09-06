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

function prefixForContentType(contentType: string): "uploads" | "audio" {
  return contentType.startsWith("audio/") ? "audio" : "uploads";
}

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

export function s3UriFor(key: string): string {
  return `s3://${BUCKET_NAME}/${key}`;
}

const TRANSCRIBE_MEDIA_FORMAT_BY_EXT: Record<string, "mp4" | "wav" | "mp3"> = {
  m4a: "mp4",
  wav: "wav",
  mp3: "mp3",
};

export function transcribeMediaFormatFor(key: string): "mp4" | "wav" | "mp3" {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return TRANSCRIBE_MEDIA_FORMAT_BY_EXT[ext] ?? "mp4";
}
