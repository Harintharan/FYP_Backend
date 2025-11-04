import { ZodError } from "zod";
import { formatZodError } from "../../errors/zodErrorFormatter.js";
import { ErrorCodes } from "../../errors/errorCodes.js";

export function respondWithZodError(res, error) {
  if (!(error instanceof ZodError)) {
    throw new TypeError("respondWithZodError expects a ZodError instance");
  }

  return res.status(400).json({
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      details: formatZodError(error),
    },
  });
}

