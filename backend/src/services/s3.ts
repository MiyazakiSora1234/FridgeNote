import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { newId } from "../lib/ids.js";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.IMAGES_BUCKET_NAME ?? "";
const PRESIGN_EXPIRY_SECONDS = 60;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * ユーザー専用プレフィックス配下にオブジェクトキーを発行し、PUT用Presigned URLを署名する。
 * userIdはAPI側でJWTのsubから取得した値のみを使う(クライアント指定を許さない)。
 */
export async function createUploadPresignedUrl(
  userId: string,
  contentType: string,
): Promise<{ imageKey: string; uploadUrl: string; expiresIn: number }> {
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "jpg";
  const imageKey = `users/${userId}/uploads/${newId()}.${ext}`;

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
