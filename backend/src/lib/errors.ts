import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const NotFoundError = (message = "not found") => new ApiError(404, "NOT_FOUND", message);
export const ValidationError = (message = "invalid request") =>
  new ApiError(400, "VALIDATION_ERROR", message);
export const ForbiddenError = (message = "forbidden") => new ApiError(403, "FORBIDDEN", message);
export const ConflictError = (message = "conflict") => new ApiError(409, "CONFLICT", message);

export function validationErrorFromZod(error: ZodError): ApiError {
  const detail = error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "value"}: ${issue.message}`)
    .join(", ");
  return ValidationError(detail || "invalid request");
}
