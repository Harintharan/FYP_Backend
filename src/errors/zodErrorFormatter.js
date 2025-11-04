import { ZodError } from "zod";

export function formatZodError(error) {
  if (!(error instanceof ZodError)) {
    throw new TypeError("formatZodError expects a ZodError instance");
  }

  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

