import { createHash } from "node:crypto";
import { ulid } from "ulid";

export const newId = (): string => ulid();

export const deterministicIdFromKey = (key: string): string =>
  createHash("sha256").update(key).digest("hex").slice(0, 20);
