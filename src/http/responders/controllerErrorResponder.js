import { isHttpError } from "../../utils/httpError.js";
import { ErrorCodes } from "../../errors/errorCodes.js";

function logControllerError(isServerError, error, logMessage, responseMessage) {
  if (isServerError) {
    console.error(logMessage ?? responseMessage, error);
    return;
  }

  if (logMessage && isHttpError(error)) {
    console.warn(logMessage, error);
  }
}

export function handleControllerError(
  res,
  error,
  { logMessage, fallbackMessage }
) {
  const status = isHttpError(error)
    ? error.statusCode
    : error.statusCode ?? 500;

  const code = isHttpError(error)
    ? error.code
    : ErrorCodes.INTERNAL_SERVER_ERROR;

  const isServerError = status >= 500;
  const responseMessage =
    !isServerError && error.message ? error.message : fallbackMessage;

  logControllerError(isServerError, error, logMessage, responseMessage);

  const payload = {
    error: {
      code,
      message: responseMessage,
    },
  };

  if (!isServerError && error.details) {
    payload.error.details = error.details;
  }

  return res.status(status).json(payload);
}

