const DEFAULT_INTERNAL_MESSAGE = "Internal server error";
export class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    const { code, details, cause } = options;
    super(message ?? DEFAULT_INTERNAL_MESSAGE);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code ?? "INTERNAL_SERVER_ERROR";
    if (details !== undefined) {
      this.details = details;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}

export function httpError(statusCode, message, options) {
  return new HttpError(statusCode, message, options);
}

export function isHttpError(value) {
  return (
    value instanceof HttpError ||
    (value &&
      typeof value === "object" &&
      typeof value.statusCode === "number" &&
      typeof value.code === "string")
  );
}
