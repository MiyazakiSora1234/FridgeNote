import { createHash } from "node:crypto";
import { ulid } from "ulid";

export const newId = (): string => ulid();

/**
 * S3オブジェクトキー(画像/音声どちらでも)から決定論的にanalysisIdを導出する。
 * 同じキーからのS3イベント重複配信や再送信で常に同一のIDへ収束させ、
 * DynamoDBの条件付き書き込みで冪等性を担保する。
 */
export const deterministicIdFromKey = (key: string): string =>
  createHash("sha256").update(key).digest("hex").slice(0, 20);

/** @deprecated deterministicIdFromKey を使うこと(画像専用ではなくなったため改名)。 */
export const analysisIdFromImageKey = deterministicIdFromKey;
