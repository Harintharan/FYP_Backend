import { ZodError } from "zod";
import { formatZodError } from "../../services/registrationIntegrityService.js";
import { isHttpError } from "../../utils/httpError.js";
import { ErrorCodes } from "../../errors/errorCodes.js";

export function respondWithZodError(res, err) {
  if (!(err instanceof ZodError)) {
    throw new TypeError("respondWithZodError called with non-ZodError");
  }
  return res.status(400).json({
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      details: formatZodError(err),
    },
  });
}

export function handleControllerError(res, err, { logMessage, fallbackMessage }) {
  const status = isHttpError(err) ? err.statusCode : err.statusCode ?? 500;
  const code = isHttpError(err) ? err.code : ErrorCodes.INTERNAL_SERVER_ERROR;
  const isServerError = status >= 500;
  const responseMessage =
    !isServerError && err.message ? err.message : fallbackMessage;

  if (isServerError) {
    console.error(logMessage ?? responseMessage, err);
  } else if (logMessage && isHttpError(err)) {
    console.warn(logMessage, err);
  }

  const payload = {
    error: {
      code,
      message: responseMessage,
    },
  };

  if (!isServerError && err.details) {
    payload.error.details = err.details;
  }

  return res.status(status).json(payload);
}
