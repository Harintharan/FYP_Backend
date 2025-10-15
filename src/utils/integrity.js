import { RegistrationError } from "../errors/registrationErrors.js";
import { normalizeHash } from "./hash.js";
import { registrationPayloadMaxBytes } from "../config.js";

export const DEFAULT_MAX_PAYLOAD_BYTES = registrationPayloadMaxBytes;

export function enforcePayloadSize(
  canonical,
  limit = DEFAULT_MAX_PAYLOAD_BYTES
) {
  const canonicalSize = Buffer.byteLength(canonical, "utf8");
  if (canonicalSize > limit) {
    throw new RegistrationError(
      `Payload exceeds limit (${limit} bytes)`,
      413
    );
  }
}

export function ensureHashMatches({
  canonicalHash,
  payloadHash,
  context,
  errorMessage = "On-chain payload hash mismatch detected",
  statusCode = 502,
}) {
  const normalizedPayloadHash = normalizeHash(payloadHash);
  if (!normalizedPayloadHash || normalizedPayloadHash !== canonicalHash) {
    console.error(errorMessage, context);
    throw new RegistrationError(errorMessage, statusCode);
  }
  return normalizedPayloadHash;
}
