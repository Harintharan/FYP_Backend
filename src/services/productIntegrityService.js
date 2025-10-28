import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { normalizeHash } from "../utils/hash.js";
import { fetchProductOnChain } from "../eth/productContract.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

function ensureString(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }
  return trimmed;
}

function toOptionalString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    value = String(value);
  }

  return value.trim();
}

function fromRecord(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    value = String(value);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function normalizeProductPayload(payload) {
  return {
    productName: ensureString(payload.productName, "productName"),
    productCategoryId: ensureString(payload.productCategoryId, "productCategoryId").toLowerCase(),
    manufacturerUuid: ensureString(payload.manufacturerUuid, "manufacturerUuid").toLowerCase(),
    requiredStartTemp: toOptionalString(payload.requiredStartTemp),
    requiredEndTemp: toOptionalString(payload.requiredEndTemp),
    handlingInstructions: toOptionalString(payload.handlingInstructions),
  };
}

export function buildProductCanonicalPayload(productId, payload) {
  return stableStringify({
    id: productId,
    productName: payload.productName,
    productCategoryId: payload.productCategoryId,
    manufacturerUuid: payload.manufacturerUuid,
    requiredStartTemp: payload.requiredStartTemp,
    requiredEndTemp: payload.requiredEndTemp,
    handlingInstructions: payload.handlingInstructions,
  });
}

export function computeProductHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function computeProductHash(productId, payload) {
  const canonical = buildProductCanonicalPayload(productId, payload);
  return computeProductHashFromCanonical(canonical);
}

export function prepareProductPersistence(
  productId,
  payload,
  defaults = {},
  overrides = {}
) {
  const merged = { ...defaults, ...payload, ...overrides };
  const normalized = normalizeProductPayload(merged);
  const canonical = buildProductCanonicalPayload(productId, normalized);
  const payloadHash = computeProductHashFromCanonical(canonical);
  return {
    normalized,
    canonical,
    payloadHash,
  };
}

export function deriveProductPayloadFromRecord(record) {
  return {
    productName:
      fromRecord(record.product_name) ??
      fromRecord(record.productName) ??
      fromRecord(record.name) ??
      "",
    productCategoryId:
      fromRecord(record.product_category_id) ??
      fromRecord(record.productCategoryId) ??
      "",
    manufacturerUuid:
      fromRecord(record.manufacturer_uuid) ??
      fromRecord(record.manufacturerUuid) ??
      "",
    requiredStartTemp: fromRecord(record.required_start_temp),
    requiredEndTemp: fromRecord(record.required_end_temp),
    handlingInstructions: fromRecord(record.handling_instructions),
  };
}

export async function ensureProductOnChainIntegrity(record) {
  const id = record.id ?? null;
  const storedHash = record.product_hash ?? null;

  if (!id) {
    throw new Error("Product record missing id");
  }
  if (!storedHash) {
    throw new Error("Product record missing stored hash");
  }

  const normalizedPayload = normalizeProductPayload(
    deriveProductPayloadFromRecord(record)
  );
  const canonical = buildProductCanonicalPayload(id, normalizedPayload);
  const computedHash = computeProductHashFromCanonical(canonical);

  const normalizedComputed = normalizeHash(computedHash);
  const normalizedStored = normalizeHash(storedHash);

  if (normalizedStored !== normalizedComputed) {
    throw new Error("Stored product hash does not match recomputed payload");
  }

  const onChain = await fetchProductOnChain(uuidToBytes16Hex(id));
  if (!onChain.hash) {
    throw new Error("Product not found on-chain");
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw new Error("On-chain product hash mismatch detected");
  }

  return { canonical, normalizedPayload, hash: normalizedComputed };
}
