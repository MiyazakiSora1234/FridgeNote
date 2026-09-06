import { RawParsedItemsSchema, type RawParsedItems } from "../../schemas/aiSchemas.js";
import { AiResponseInvalidError } from "./errors.js";

export function parseRawParsedItemsOrThrow(raw: unknown): RawParsedItems {
  const result = RawParsedItemsSchema.safeParse(raw);
  if (!result.success) throw new AiResponseInvalidError(result.error.message, raw);
  return result.data;
}
