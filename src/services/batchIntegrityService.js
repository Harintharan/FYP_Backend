import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { fetchBatchOnChain } from "../eth/batchContract.js";
import { normalizeHash } from "./registrationIntegrityService.js";

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

export function normalizeBatchPayload(payload) {
  return {
    productCategory: assertString(payload.productCategory, "productCategory"),
    manufacturerUUID: assertString(payload.manufacturerUUID, "manufacturerUUID"),
    facility: assertString(payload.facility, "facility"),
    productionWindow: assertString(payload.productionWindow, "productionWindow"),
    quantityProduced: normalizeQuantity(payload.quantityProduced),
    releaseStatus: assertString(payload.releaseStatus, "releaseStatus"),
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
  });
}

export function computeBatchHash(batchId, payload) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes16", "string", "string", "string", "string", "string", "string"],
      [
        uuidToBytes16Hex(batchId),
        payload.productCategory,
        payload.manufacturerUUID,
        payload.facility,
        payload.productionWindow,
        payload.quantityProduced,
        payload.releaseStatus,
      ]
    )
  );
}

export function prepareBatchPersistence(batchId, payload) {
  const normalized = normalizeBatchPayload(payload);
  return {
    normalized,
    canonical: buildBatchCanonicalPayload(batchId, normalized),
    payloadHash: computeBatchHash(batchId, normalized),
  };
}

function extractRecordPayload(record) {
  return {
    productCategory:
      record.product_category ?? record.productCategory ?? "",
    manufacturerUUID:
      record.manufacturer_uuid ?? record.manufacturerUUID ?? "",
    facility: record.facility ?? "",
    productionWindow:
      record.production_window ?? record.productionWindow ?? "",
    quantityProduced:
      record.quantity_produced ?? record.quantityProduced ?? "",
    releaseStatus: record.release_status ?? record.releaseStatus ?? "",
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

  const normalizedPayload = normalizeBatchPayload(extractRecordPayload(record));
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
