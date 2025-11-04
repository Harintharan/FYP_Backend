import { HttpError } from "../utils/httpError.js";

export const BatchErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "BATCH_REGISTRATION_REQUIRED",
  MANUFACTURER_FORBIDDEN: "BATCH_MANUFACTURER_FORBIDDEN",
  MANUFACTURER_MISMATCH: "BATCH_MANUFACTURER_MISMATCH",
  HASH_MISMATCH: "BATCH_HASH_MISMATCH",
  NOT_FOUND: "BATCH_NOT_FOUND",
  MANUFACTURER_IMMUTABLE: "BATCH_MANUFACTURER_IMMUTABLE",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: BatchErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function manufacturerMismatch() {
  return new HttpError(
    403,
    "manufacturerUUID does not match authenticated manufacturer",
    { code: BatchErrorCodes.MANUFACTURER_MISMATCH }
  );
}

export function manufacturerForbidden() {
  return new HttpError(
    403,
    "Cannot operate on batches for other manufacturers",
    { code: BatchErrorCodes.MANUFACTURER_FORBIDDEN }
  );
}

export function manufacturerImmutable() {
  return new HttpError(400, "manufacturerUUID cannot be changed", {
    code: BatchErrorCodes.MANUFACTURER_IMMUTABLE,
  });
}

export function batchNotFound() {
  return new HttpError(404, "Batch not found", {
    code: BatchErrorCodes.NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(502, "On-chain batch hash mismatch detected", {
    code: BatchErrorCodes.HASH_MISMATCH,
    details,
  });
}
