import { createHash } from "node:crypto";
import { ulid } from "ulid";

export const newId = (): string => ulid();

// 同じキーからのS3イベント重複配信でも常に同一IDへ収束させ、条件付き書き込みで冪等性を担保する。
export const deterministicIdFromKey = (key: string): string =>
  createHash("sha256").update(key).digest("hex").slice(0, 20);
