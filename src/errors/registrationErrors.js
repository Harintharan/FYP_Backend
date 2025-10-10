export class RegistrationError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "RegistrationError";
    this.status = status;
    this.details = details;
  }
}

export class IntegrityError extends RegistrationError {
  constructor(message) {
    super(message, 409);
    this.name = "IntegrityError";
  }
}

export class NotFoundError extends RegistrationError {
  constructor(message = "Registration not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends RegistrationError {
  constructor(details) {
    super("Validation failed", 400, details);
    this.name = "ValidationError";
  }
}

const BUILTIN_STATUS = {
  ValidationError: 400,
  IntegrityError: 409,
  NotFoundError: 404,
};

export function mapErrorToResponse(err) {
  if (err instanceof RegistrationError) {
    const status =
      err.status ?? BUILTIN_STATUS[err.name] ?? 400;
    const body = err.details
      ? { error: err.message, details: err.details }
      : { error: err.message };
    return { status, body };
  }

  return { status: 500, body: { error: "Internal server error" } };
}
