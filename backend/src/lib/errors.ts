import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const NotFoundError = (message = "not found") => new ApiError(404, "NOT_FOUND", message);
export const ValidationError = (message = "invalid request") =>
  new ApiError(400, "VALIDATION_ERROR", message);
export const ForbiddenError = (message = "forbidden") => new ApiError(403, "FORBIDDEN", message);
export const ConflictError = (message = "conflict") => new ApiError(409, "CONFLICT", message);

/**
 * ZodErrorをAPIレスポンス向けの短い文言に整形する。
 * `error.message`をそのまま返すとZodの内部issue配列がJSON文字列として
 * ダンプされ、スキーマの内部構造を外部に漏らしてしまうため、
 * 「フィールド名: メッセージ」の形に整形してから返す。
 */
export function validationErrorFromZod(error: ZodError): ApiError {
  const detail = error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "value"}: ${issue.message}`)
    .join(", ");
  return ValidationError(detail || "invalid request");
}
