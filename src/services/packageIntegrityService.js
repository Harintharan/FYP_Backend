import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import {
  PackagePayload,
  PACKAGE_STATUS_VALUES,
} from "../domain/package.schema.js";
import { normalizeHash } from "../utils/hash.js";
import { fetchProductOnChain } from "../eth/packageContract.js";
import { PackageErrorCodes, hashMismatch } from "../errors/packageErrors.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const EMPTY_FALLBACK = "";
const VALID_PACKAGE_STATUSES = new Set(PACKAGE_STATUS_VALUES);

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

  return VALID_PACKAGE_STATUSES.has(normalized) ? normalized : null;
}

function coercePayload(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const coerced = {};

  const upsert = (key, value) => {
    if (value !== undefined) {
      coerced[key] = value;
    }
  };

  upsert(
    "manufacturerUUID",
    pickValue(raw, "manufacturerUUID", "manufacturer_uuid")
  );
  upsert("batchId", pickValue(raw, "batchId", "batch_id"));
  upsert("shipmentId", pickValue(raw, "shipmentId", "shipment_id"));
  upsert("quantity", pickValue(raw, "quantity"));
  upsert(
    "microprocessorMac",
    pickValue(raw, "microprocessorMac", "microprocessor_mac")
  );
  upsert("sensorTypes", pickValue(raw, "sensorTypes", "sensor_types"));
  upsert("status", pickValue(raw, "status"));

  return coerced;
}

export function normalizePackagePayload(rawPayload, defaults = {}) {
  const coerced = { ...defaults, ...coercePayload(rawPayload) };
  return PackagePayload.parse(coerced);
}

const PACKAGE_FIELDS = [
  "manufacturerUUID",
  "batchId",
  "shipmentId",
  "quantity",
  "microprocessorMac",
  "sensorTypes",
  "status",
];

function valueOrEmpty(value) {
  return value ?? EMPTY_FALLBACK;
}

export function buildPackageCanonicalPayload(packageId, payload) {
  const entries = {
    id: packageId,
  };

  for (const field of PACKAGE_FIELDS) {
    entries[field] = valueOrEmpty(payload[field]);
  }

  return stableStringify(entries);
}

export function computePackageHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function computePackageHash(packageId, payload) {
  const canonical = buildPackageCanonicalPayload(packageId, payload);
  return computePackageHashFromCanonical(canonical);
}

export function preparePackagePersistence(
  packageId,
  rawPayload,
  defaults = {},
  overrides = {}
) {
  const normalized = normalizePackagePayload(rawPayload, defaults);
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
  const canonical = buildPackageCanonicalPayload(packageId, normalized);
  const payloadHash = computePackageHashFromCanonical(canonical);
  return {
    normalized,
    canonical,
    payloadHash,
  };
}

export function derivePackagePayloadFromRecord(record) {
  return {
    manufacturerUUID: toNullableString(
      record.manufacturer_uuid ?? record.manufacturerUUID
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
    status: sanitizeStatus(record.status),
  };
}

export async function ensurePackageOnChainIntegrity(record) {
  const id = record.id ?? record.product_uuid ?? record.productUUID ?? null;
  const storedHash = record.product_hash ?? record.productHash;

  if (!id) {
    throw new Error("Package record missing id");
  }
  if (!storedHash) {
    throw new Error("Package record missing stored hash");
  }

  const normalizedPayload = normalizePackagePayload(
    derivePackagePayloadFromRecord(record)
  );
  const canonical = buildPackageCanonicalPayload(id, normalizedPayload);
  const computedHash = computePackageHashFromCanonical(canonical);
  const normalizedStored = normalizeHash(storedHash);
  const normalizedComputed = normalizeHash(computedHash);

  if (normalizedStored !== normalizedComputed) {
    throw hashMismatch({
      reason: "Stored hash does not match recomputed payload",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: PackageErrorCodes.HASH_MISMATCH,
    });
  }

  const onChain = await fetchProductOnChain(uuidToBytes16Hex(id));
  if (!onChain.hash) {
    throw hashMismatch({
      reason: "Package not found on-chain",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: PackageErrorCodes.HASH_MISMATCH,
    });
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain package hash mismatch",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  return { canonical, normalizedPayload, hash: normalizedComputed };
}

export function formatPackageRecord(record) {
  return {
    id: record.id ?? record.product_uuid ?? record.productUUID ?? null,
    manufacturerUUID: record.manufacturer_uuid ?? null,
    batchId: record.batch_id ?? null,
    shipmentId: toNullableString(record.shipment_id ?? record.shipmentId),
    quantity:
      record.quantity !== undefined && record.quantity !== null
        ? Number(record.quantity)
        : null,
    microprocessorMac: record.microprocessor_mac ?? null,
    sensorTypes: record.sensor_types ?? null,
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
