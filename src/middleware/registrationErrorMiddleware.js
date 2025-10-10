import { ZodError } from "zod";
import {
  ValidationError,
  mapErrorToResponse,
} from "../errors/registrationErrors.js";
import { formatZodError } from "../services/registrationIntegrityService.js";

export function respondWithRegistrationError(res, err) {
  if (err instanceof ZodError) {
    const validationError = new ValidationError(formatZodError(err));
    const { status, body } = mapErrorToResponse(validationError);
    return res.status(status).json(body);
  }

  const { status, body } = mapErrorToResponse(err);
  if (status >= 500) {
    console.error("❌ Registration controller error:", err);
  }
  return res.status(status).json(body);
}
