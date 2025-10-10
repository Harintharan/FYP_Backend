import { keccak256, toUtf8Bytes } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { registry } from "../eth/contract.js";
import { IntegrityError } from "../errors/registrationErrors.js";

export function normalizeHash(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export async function ensureOnChainIntegrity(row) {
  const {
    id: registrationId,
    payload_hash: storedHash,
    payload_canonical: canonical,
    payload,
  } = row;

  if (!canonical || typeof canonical !== "string") {
    throw new IntegrityError("Canonical payload missing or invalid");
  }

  if (!payload) {
    throw new IntegrityError("Payload JSON missing");
  }

  const canonicalFromPayload = stableStringify(payload);
  if (canonicalFromPayload !== canonical) {
    throw new IntegrityError("Payload data mismatch detected");
  }

  const canonicalHash = normalizeHash(keccak256(toUtf8Bytes(canonical)));
  const normalizedStored = normalizeHash(storedHash);
  if (normalizedStored && normalizedStored !== canonicalHash) {
    throw new IntegrityError(
      "Stored payload hash does not match canonical payload"
    );
  }

  const uuidBytes16 = uuidToBytes16Hex(registrationId);
  const exists = await registry.exists(uuidBytes16);
  if (!exists) {
    throw new IntegrityError("Registration record not found on-chain");
  }

  const onChain = await registry.getRegistration(uuidBytes16);
  const chainHash = normalizeHash(onChain.payloadHash ?? onChain[0]);
  if (!chainHash) {
    throw new IntegrityError("On-chain payload hash missing");
  }

  if (chainHash !== canonicalHash) {
    throw new IntegrityError("On-chain payload hash mismatch detected");
  }
}
