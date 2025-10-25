import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import {
  ProductPayload,
  PRODUCT_STATUS_VALUES,
} from "../domain/product.schema.js";
import { normalizeHash } from "../utils/hash.js";
import { fetchProductOnChain } from "../eth/productContract.js";
import { decrypt } from "../utils/encryptionHelper.js";
import { ProductErrorCodes, hashMismatch } from "../errors/productErrors.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const EMPTY_FALLBACK = "";
const VALID_PRODUCT_STATUSES = new Set(PRODUCT_STATUS_VALUES);

function pickValue(source, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function sanitizeStatus(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  return VALID_PRODUCT_STATUSES.has(normalized) ? normalized : null;
}

function coercePayload(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return {
    manufacturerUUID: pickValue(raw, "manufacturerUUID", "manufacturer_uuid"),
    productName: pickValue(raw, "productName", "product_name"),
    productCategory: pickValue(raw, "productCategory", "product_category"),
    batchId: pickValue(raw, "batchId", "batch_id", "batch_lot_id", "batchLotId"),
    shipmentId: pickValue(raw, "shipmentId", "shipment_id"),
    quantity: pickValue(raw, "quantity"),
    microprocessorMac: pickValue(
      raw,
      "microprocessorMac",
      "microprocessor_mac"
    ),
    sensorTypes: pickValue(raw, "sensorTypes", "sensor_types"),
    wifiSSID: pickValue(raw, "wifiSSID", "wifi_ssid"),
    wifiPassword: pickValue(raw, "wifiPassword", "wifi_password"),
    status: pickValue(raw, "status"),
  };
}

export function normalizeProductPayload(rawPayload, defaults = {}) {
  const coerced = { ...defaults, ...coercePayload(rawPayload) };
  return ProductPayload.parse(coerced);
}

const PRODUCT_FIELDS = [
  "productName",
  "productCategory",
  "manufacturerUUID",
  "batchId",
  "shipmentId",
  "quantity",
  "microprocessorMac",
  "sensorTypes",
  "wifiSSID",
  "wifiPassword",
  "status",
];

function valueOrEmpty(value) {
  return value ?? EMPTY_FALLBACK;
}

export function buildProductCanonicalPayload(productId, payload) {
  const entries = {
    id: productId,
  };

  for (const field of PRODUCT_FIELDS) {
    entries[field] = valueOrEmpty(payload[field]);
  }

  return stableStringify(entries);
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
  rawPayload,
  defaults = {},
  overrides = {}
) {
  const normalized = normalizeProductPayload(rawPayload, defaults);
  if (overrides && typeof overrides === "object") {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        normalized[key] = value;
      }
    }
  }
  if (normalized.shipmentId) {
    normalized.shipmentId = normalized.shipmentId.toLowerCase();
  }
  if (normalized.quantity !== undefined && normalized.quantity !== null) {
    normalized.quantity = Number(normalized.quantity);
  }
  const canonical = buildProductCanonicalPayload(productId, normalized);
  const payloadHash = computeProductHashFromCanonical(canonical);
  return {
    normalized,
    canonical,
    payloadHash,
  };
}

function decryptIfEncrypted(value) {
  if (!value) {
    return null;
  }

  try {
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      return decrypt(value);
    }
  } catch (err) {
    console.warn("⚠️ Failed to decrypt value, using raw:", err);
  }
  return value;
}

export function deriveProductPayloadFromRecord(record) {
  return {
    manufacturerUUID: toNullableString(
      record.manufacturer_uuid ?? record.manufacturerUUID
    ),
    productName: toNullableString(record.product_name ?? record.productName),
    productCategory: toNullableString(
      record.product_category ?? record.productCategory
    ),
    batchId: toNullableString(record.batch_id ?? record.batchId),
    shipmentId: toNullableString(record.shipment_id ?? record.shipmentId),
    quantity:
      record.quantity !== undefined && record.quantity !== null
        ? Number(record.quantity)
        : null,
    microprocessorMac: toNullableString(
      record.microprocessor_mac ?? record.microprocessorMac
    ),
    sensorTypes: toNullableString(record.sensor_types ?? record.sensorTypes),
    wifiSSID: toNullableString(record.wifi_ssid ?? record.wifiSSID),
    wifiPassword: toNullableString(
      decryptIfEncrypted(record.wifi_password ?? record.wifiPassword)
    ),
    status: sanitizeStatus(record.status),
  };
}

export async function ensureProductOnChainIntegrity(record) {
  const id = record.id ?? record.product_uuid ?? record.productUUID ?? null;
  const storedHash = record.product_hash ?? record.productHash;

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
  const normalizedStored = normalizeHash(storedHash);
  const normalizedComputed = normalizeHash(computedHash);

  if (normalizedStored !== normalizedComputed) {
    throw hashMismatch({
      reason: "Stored hash does not match recomputed payload",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ProductErrorCodes.HASH_MISMATCH,
    });
  }

  const onChain = await fetchProductOnChain(uuidToBytes16Hex(id));
  if (!onChain.hash) {
    throw hashMismatch({
      reason: "Product not found on-chain",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ProductErrorCodes.HASH_MISMATCH,
    });
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain product hash mismatch",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  return { canonical, normalizedPayload, hash: normalizedComputed };
}

export function formatProductRecord(record) {
  return {
    id: record.id ?? record.product_uuid ?? record.productUUID ?? null,
    productName: record.product_name ?? null,
    productCategory: record.product_category ?? null,
    manufacturerUUID: record.manufacturer_uuid ?? null,
    batchId: record.batch_id ?? null,
    shipmentId: toNullableString(record.shipment_id ?? record.shipmentId),
    quantity:
      record.quantity !== undefined && record.quantity !== null
        ? Number(record.quantity)
        : null,
    microprocessorMac: record.microprocessor_mac ?? null,
    sensorTypes: record.sensor_types ?? null,
    wifiSSID: record.wifi_ssid ?? null,
    wifiPassword: toNullableString(
      decryptIfEncrypted(record.wifi_password ?? record.wifiPassword ?? null)
    ),
    status: sanitizeStatus(record.status),
    productHash: normalizeHash(record.product_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}
