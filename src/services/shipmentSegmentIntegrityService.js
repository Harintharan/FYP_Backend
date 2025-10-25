import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import {
  ShipmentSegmentPayload,
  SHIPMENT_SEGMENT_STATUS_VALUES,
} from "../domain/shipmentSegment.schema.js";
import { normalizeHash } from "../utils/hash.js";
import { fetchShipmentSegmentOnChain } from "../eth/shipmentSegmentContract.js";
import {
  hashMismatch,
  ShipmentSegmentErrorCodes,
} from "../errors/shipmentSegmentErrors.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const EMPTY = "";
const SEGMENT_FIELDS = [
  "shipmentId",
  "startCheckpointId",
  "endCheckpointId",
  "expectedShipDate",
  "estimatedArrivalDate",
  "timeTolerance",
  "supplierId",
  "segmentOrder",
  "status",
];

function pickValue(source, ...keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }
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

function resolveField(raw, defaults, ...keys) {
  const value = pickValue(raw, ...keys);
  if (value !== undefined) {
    return value;
  }
  if (!defaults) {
    return undefined;
  }
  return pickValue(defaults, ...keys);
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeUuid(value) {
  const str = toNullableString(value);
  return str ? str.toLowerCase() : null;
}

function sanitizeStatus(value) {
  const str = toNullableString(value);
  if (!str) {
    return "PENDING";
  }
  const upper = str.toUpperCase();
  return SHIPMENT_SEGMENT_STATUS_VALUES.includes(upper) ? upper : "PENDING";
}

function coerceShipmentSegmentPayload(rawPayload, defaults = {}) {
  return {
    shipmentId: resolveField(rawPayload, defaults, "shipmentId", "shipment_id"),
    startCheckpointId: resolveField(
      rawPayload,
      defaults,
      "startCheckpointId",
      "start_checkpoint_id"
    ),
    endCheckpointId: resolveField(
      rawPayload,
      defaults,
      "endCheckpointId",
      "end_checkpoint_id"
    ),
    expectedShipDate: resolveField(
      rawPayload,
      defaults,
      "expectedShipDate",
      "expected_ship_date"
    ),
    estimatedArrivalDate: resolveField(
      rawPayload,
      defaults,
      "estimatedArrivalDate",
      "estimated_arrival_date"
    ),
    timeTolerance: resolveField(
      rawPayload,
      defaults,
      "timeTolerance",
      "time_tolerance"
    ),
    supplierId: resolveField(
      rawPayload,
      defaults,
      "supplierId",
      "supplier_id"
    ),
    segmentOrder: resolveField(
      rawPayload,
      defaults,
      "segmentOrder",
      "segment_order"
    ),
    status: resolveField(rawPayload, defaults, "status", "segmentStatus"),
  };
}

export function normalizeShipmentSegmentPayload(rawPayload, defaults = {}) {
  const coerced = coerceShipmentSegmentPayload(rawPayload, defaults);
  const parsed = ShipmentSegmentPayload.parse(coerced);

  return {
    shipmentId: normalizeUuid(parsed.shipmentId),
    startCheckpointId: normalizeUuid(parsed.startCheckpointId),
    endCheckpointId: normalizeUuid(parsed.endCheckpointId),
    expectedShipDate: toNullableString(parsed.expectedShipDate),
    estimatedArrivalDate: toNullableString(parsed.estimatedArrivalDate),
    timeTolerance: toNullableString(parsed.timeTolerance),
    supplierId: toNullableString(parsed.supplierId),
    segmentOrder:
      typeof parsed.segmentOrder === "number" ? parsed.segmentOrder : null,
    status: sanitizeStatus(parsed.status),
  };
}

function valueOrEmpty(value) {
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : EMPTY;
  }
  const str = String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? EMPTY : trimmed;
}

export function buildShipmentSegmentCanonicalPayload(segmentId, payload) {
  const entries = { id: segmentId };
  for (const field of SEGMENT_FIELDS) {
    entries[field] = valueOrEmpty(payload[field]);
  }
  return stableStringify(entries);
}

export function computeShipmentSegmentHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function computeShipmentSegmentHash(segmentId, payload) {
  const canonical = buildShipmentSegmentCanonicalPayload(segmentId, payload);
  return computeShipmentSegmentHashFromCanonical(canonical);
}

export function prepareShipmentSegmentPersistence(
  segmentId,
  rawPayload,
  defaults = {}
) {
  const normalized = normalizeShipmentSegmentPayload(rawPayload, defaults);
  const canonical = buildShipmentSegmentCanonicalPayload(segmentId, normalized);
  const payloadHash = computeShipmentSegmentHashFromCanonical(canonical);

  return {
    normalized,
    canonical,
    payloadHash,
  };
}

export function deriveShipmentSegmentPayloadFromRecord(record) {
  return {
    shipmentId: record.shipment_id ?? record.shipmentId ?? null,
    startCheckpointId:
      record.start_checkpoint_id ?? record.startCheckpointId ?? null,
    endCheckpointId:
      record.end_checkpoint_id ?? record.endCheckpointId ?? null,
    expectedShipDate:
      record.expected_ship_date ?? record.expectedShipDate ?? null,
    estimatedArrivalDate:
      record.estimated_arrival_date ?? record.estimatedArrivalDate ?? null,
    timeTolerance: record.time_tolerance ?? record.timeTolerance ?? null,
    supplierId: record.supplier_id ?? record.supplierId ?? null,
    segmentOrder: record.segment_order ?? record.segmentOrder ?? null,
    status: record.status ?? null,
  };
}

export async function ensureShipmentSegmentOnChainIntegrity(record) {
  if (!record) {
    throw hashMismatch({
      reason: "Shipment segment record missing",
      code: ShipmentSegmentErrorCodes.NOT_FOUND,
    });
  }

  const segmentId = record.id ?? record.segment_id ?? record.segmentId ?? null;
  if (!segmentId) {
    throw hashMismatch({
      reason: "Shipment segment missing id",
      code: ShipmentSegmentErrorCodes.NOT_FOUND,
    });
  }

  const storedHash = record.segment_hash ?? record.segmentHash ?? null;
  if (!storedHash) {
    throw hashMismatch({
      reason: "Shipment segment missing stored hash",
      code: ShipmentSegmentErrorCodes.HASH_MISMATCH,
    });
  }

  const payloadSource = deriveShipmentSegmentPayloadFromRecord(record);
  const normalizedPayload = normalizeShipmentSegmentPayload(payloadSource);
  const canonical = buildShipmentSegmentCanonicalPayload(
    segmentId,
    normalizedPayload
  );
  const computedHash = computeShipmentSegmentHashFromCanonical(canonical);
  const normalizedStored = normalizeHash(storedHash);
  const normalizedComputed = normalizeHash(computedHash);

  if (normalizedStored !== normalizedComputed) {
    throw hashMismatch({
      reason: "Stored segment hash does not match recomputed payload",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ShipmentSegmentErrorCodes.HASH_MISMATCH,
    });
  }

  const onChain = await fetchShipmentSegmentOnChain(
    uuidToBytes16Hex(segmentId)
  );
  const normalizedOnChain = normalizeHash(onChain.hash ?? null);

  if (!onChain.hash || normalizedOnChain === normalizeHash(ethers.ZeroHash)) {
    throw hashMismatch({
      reason: "Shipment segment not found on-chain",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ShipmentSegmentErrorCodes.HASH_MISMATCH,
    });
  }

  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain shipment segment hash mismatch",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
      code: ShipmentSegmentErrorCodes.HASH_MISMATCH,
    });
  }

  return {
    canonical,
    normalizedPayload,
    hash: normalizedComputed,
  };
}

export function formatShipmentSegmentRecord(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id ?? record.segment_id ?? record.segmentId ?? null,
    shipmentId: normalizeUuid(
      record.shipment_id ?? record.shipmentId ?? null
    ),
    startCheckpointId: normalizeUuid(
      record.start_checkpoint_id ?? record.startCheckpointId ?? null
    ),
    endCheckpointId: normalizeUuid(
      record.end_checkpoint_id ?? record.endCheckpointId ?? null
    ),
    expectedShipDate: toNullableString(
      record.expected_ship_date ?? record.expectedShipDate ?? null
    ),
    estimatedArrivalDate: toNullableString(
      record.estimated_arrival_date ?? record.estimatedArrivalDate ?? null
    ),
    timeTolerance: toNullableString(
      record.time_tolerance ?? record.timeTolerance ?? null
    ),
    supplierId: toNullableString(
      record.supplier_id ?? record.supplierId ?? null
    ),
    segmentOrder:
      typeof record.segment_order === "number"
        ? record.segment_order
        : typeof record.segmentOrder === "number"
          ? record.segmentOrder
          : null,
    status: sanitizeStatus(record.status ?? null),
    segmentHash: normalizeHash(record.segment_hash ?? record.segmentHash ?? null),
    txHash: record.tx_hash ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    startName: record.start_name ?? record.startName ?? null,
    endName: record.end_name ?? record.endName ?? null,
  };
}
