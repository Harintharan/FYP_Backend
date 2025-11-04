import { HttpError } from "../utils/httpError.js";

export const CheckpointErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "CHECKPOINT_REGISTRATION_REQUIRED",
  OWNER_FORBIDDEN: "CHECKPOINT_OWNER_FORBIDDEN",
  OWNER_MISMATCH: "CHECKPOINT_OWNER_MISMATCH",
  CHECKPOINT_NOT_FOUND: "CHECKPOINT_NOT_FOUND",
  HASH_MISMATCH: "CHECKPOINT_HASH_MISMATCH",
});

export function registrationRequired() {
  return new HttpError(403, "Registration required for checkpoint operations", {
    code: CheckpointErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function ownerForbidden() {
  return new HttpError(
    403,
    "Cannot operate on checkpoints for other owners",
    { code: CheckpointErrorCodes.OWNER_FORBIDDEN }
  );
}

export function ownerMismatch() {
  return new HttpError(
    403,
    "ownerUUID does not match authenticated owner",
    { code: CheckpointErrorCodes.OWNER_MISMATCH }
  );
}

export function checkpointNotFound() {
  return new HttpError(404, "Checkpoint not found", {
    code: CheckpointErrorCodes.CHECKPOINT_NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(502, "On-chain checkpoint hash mismatch detected", {
    code: CheckpointErrorCodes.HASH_MISMATCH,
    details,
  });
}
