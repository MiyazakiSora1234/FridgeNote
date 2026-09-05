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
