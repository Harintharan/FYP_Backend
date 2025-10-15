import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { fetchBatchOnChain } from "../eth/batchContract.js";
import { normalizeHash } from "../utils/hash.js";

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function assertString(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    value = String(value);
  }

  return value.trim();
}

function normalizeQuantity(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("quantityProduced must be finite");
    }
    if (value < 0) {
      throw new Error("quantityProduced must be non-negative");
    }
    return value.toString();
  }

  return assertString(value, "quantityProduced");
}

function requiredFromRecord(value) {
  const resolved = value ?? "";
  return typeof resolved === "string" ? resolved.trim() : String(resolved).trim();
}

function optionalFromRecord(value) {
  const resolved = firstDefined(value, undefined);
  if (resolved === undefined || resolved === null) {
    return undefined;
  }
  if (typeof resolved !== "string") {
    resolved = String(resolved);
  }
  const trimmed = resolved.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function normalizeBatchPayload(payload) {
  return {
    productCategory: assertString(payload.productCategory, "productCategory"),
    manufacturerUUID: assertString(payload.manufacturerUUID, "manufacturerUUID"),
    facility: assertString(payload.facility, "facility"),
    productionWindow: assertString(payload.productionWindow, "productionWindow"),
    quantityProduced: normalizeQuantity(payload.quantityProduced),
    releaseStatus: assertString(payload.releaseStatus, "releaseStatus"),
    expiryDate: normalizeOptionalString(payload.expiryDate),
    handlingInstructions: normalizeOptionalString(payload.handlingInstructions),
    requiredStartTemp: normalizeOptionalString(payload.requiredStartTemp),
    requiredEndTemp: normalizeOptionalString(payload.requiredEndTemp),
  };
}

export function buildBatchCanonicalPayload(batchId, payload) {
  return stableStringify({
    id: batchId,
    productCategory: payload.productCategory,
    manufacturerUUID: payload.manufacturerUUID,
    facility: payload.facility,
    productionWindow: payload.productionWindow,
    quantityProduced: payload.quantityProduced,
    releaseStatus: payload.releaseStatus,
    expiryDate: payload.expiryDate,
    handlingInstructions: payload.handlingInstructions,
    requiredStartTemp: payload.requiredStartTemp,
    requiredEndTemp: payload.requiredEndTemp,
  });
}

export function computeBatchHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function computeBatchHash(batchId, payload) {
  const canonical = buildBatchCanonicalPayload(batchId, payload);
  return computeBatchHashFromCanonical(canonical);
}

export function prepareBatchPersistence(batchId, payload, defaults = {}) {
  const merged = { ...defaults, ...payload };
  const normalized = normalizeBatchPayload(merged);
  return {
    normalized,
    canonical: buildBatchCanonicalPayload(batchId, normalized),
    payloadHash: computeBatchHash(batchId, normalized),
  };
}

export function deriveBatchPayloadFromRecord(record) {
  return {
    productCategory: requiredFromRecord(
      firstDefined(record.product_category, record.productCategory, "")
    ),
    manufacturerUUID: requiredFromRecord(
      firstDefined(record.manufacturer_uuid, record.manufacturerUUID, "")
    ),
    facility: requiredFromRecord(firstDefined(record.facility, "")),
    productionWindow: requiredFromRecord(
      firstDefined(record.production_window, record.productionWindow, "")
    ),
    quantityProduced: requiredFromRecord(
      firstDefined(record.quantity_produced, record.quantityProduced, "")
    ),
    releaseStatus: requiredFromRecord(
      firstDefined(record.release_status, record.releaseStatus, "")
    ),
    expiryDate: optionalFromRecord(
      firstDefined(record.expiry_date, record.expiryDate)
    ),
    handlingInstructions: optionalFromRecord(
      firstDefined(
        record.handling_instructions,
        record.handlingInstructions
      )
    ),
    requiredStartTemp: optionalFromRecord(
      firstDefined(
        record.required_start_temp,
        record.requiredStartTemp
      )
    ),
    requiredEndTemp: optionalFromRecord(
      firstDefined(record.required_end_temp, record.requiredEndTemp)
    ),
  };
}

export async function ensureBatchOnChainIntegrity(record) {
  const { id, batch_hash: storedHash } = record;

  if (!id) {
    throw new Error("Batch record missing id");
  }

  if (!storedHash) {
    throw new Error("Batch hash missing");
  }

  const normalizedPayload = normalizeBatchPayload(
    deriveBatchPayloadFromRecord(record)
  );
  const canonical = buildBatchCanonicalPayload(id, normalizedPayload);

  const computedHash = computeBatchHash(id, normalizedPayload);
  const normalizedComputed = normalizeHash(computedHash);
  const normalizedStored = normalizeHash(storedHash);

  if (normalizedStored !== normalizedComputed) {
    throw new Error("Stored batch hash does not match recomputed payload");
  }

  const onChain = await fetchBatchOnChain(uuidToBytes16Hex(id));
  if (!onChain.hash) {
    throw new Error("Batch not found on-chain");
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw new Error("On-chain batch hash mismatch detected");
  }

  return { canonical, normalizedPayload, hash: normalizedComputed };
}
