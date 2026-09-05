import { createHash } from "node:crypto";
import { ulid } from "ulid";

export const newId = (): string => ulid();

/**
 * imageKeyから決定論的にanalysisIdを導出する。
 * 同じ画像(=同じキー)からのS3イベント重複配信や再送信で
 * 常に同一のanalysisIdへ収束させ、DynamoDBの条件付き書き込みで冪等性を担保する。
 */
export const analysisIdFromImageKey = (imageKey: string): string =>
  createHash("sha256").update(imageKey).digest("hex").slice(0, 20);
