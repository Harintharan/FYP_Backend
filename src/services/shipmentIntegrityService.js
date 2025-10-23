import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import {
  ShipmentPayload,
  ShipmentItemPayload,
  ShipmentCheckpointPayload,
} from "../domain/shipment.schema.js";
import { normalizeHash } from "../utils/hash.js";
import { fetchShipmentOnChain } from "../eth/shipmentContract.js";
import { hashMismatch, ShipmentErrorCodes } from "../errors/shipmentErrors.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const EMPTY = "";

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

export function normalizeShipmentPayload(rawPayload, defaults = {}) {
  const candidate = {
    manufacturerUUID:
      pickValue(
        rawPayload,
        "manufacturerUUID",
        "manufacturer_uuid",
        "manufacturerUuid"
      ) ??
      defaults.manufacturerUUID ??
      defaults.manufacturer_uuid ??
      defaults.manufacturerUuid,
    consumerUUID:
      pickValue(
        rawPayload,
        "consumerUUID",
        "consumer_uuid",
        "destinationPartyUUID",
        "destination_party_uuid",
        "consumerUuid"
      ) ??
      defaults.consumerUUID ??
      defaults.consumer_uuid ??
      defaults.destinationPartyUUID ??
      defaults.destination_party_uuid ??
      defaults.consumerUuid,
  };

  const parsed = ShipmentPayload.parse(candidate);
  return {
    manufacturerUUID: normalizeUuid(parsed.manufacturerUUID),
    consumerUUID: normalizeUuid(parsed.consumerUUID),
  };
}

export function normalizeShipmentItems(rawItems = [], defaults = []) {
  const input = Array.isArray(rawItems) ? rawItems : [];
  const fallback = Array.isArray(defaults) ? defaults : [];

  const normalized = input.map((item, index) => {
    const defaultsForIndex = fallback[index] ?? {};
    const candidate = {
      productUUID:
        pickValue(
          item,
          "productUUID",
          "product_uuid",
          "productId",
          "product_id",
          "id"
        ) ??
        pickValue(
          defaultsForIndex,
          "productUUID",
          "product_uuid",
          "productId",
          "product_id",
          "id"
        ),
      quantity:
        pickValue(item, "quantity", "qty") ??
        pickValue(defaultsForIndex, "quantity", "qty"),
    };

    const parsed = ShipmentItemPayload.parse(candidate);
    return {
      productUUID: normalizeUuid(parsed.productUUID),
      quantity:
        parsed.quantity === undefined || parsed.quantity === null
          ? null
          : Number(parsed.quantity),
    };
  });

  return normalized
    .map((entry, index) => ({ ...entry, _index: index }))
    .sort((a, b) => {
      const idCompare = a.productUUID.localeCompare(b.productUUID);
      if (idCompare !== 0) {
        return idCompare;
      }
      const qtyA = a.quantity ?? -1;
      const qtyB = b.quantity ?? -1;
      if (qtyA !== qtyB) {
        return qtyA - qtyB;
      }
      return a._index - b._index;
    })
    .map(({ _index, ...rest }) => rest);
}

export function normalizeShipmentCheckpoints(rawCheckpoints = [], defaults = []) {
  const input = Array.isArray(rawCheckpoints) ? rawCheckpoints : [];
  const fallback = Array.isArray(defaults) ? defaults : [];

  const normalized = input.map((raw, index) => {
    const defaultsForIndex = fallback[index] ?? {};
    const candidate = {
      startCheckpointId:
        pickValue(raw, "startCheckpointId", "start_checkpoint_id") ??
        pickValue(
          defaultsForIndex,
          "startCheckpointId",
          "start_checkpoint_id"
        ),
      endCheckpointId:
        pickValue(raw, "endCheckpointId", "end_checkpoint_id") ??
        pickValue(defaultsForIndex, "endCheckpointId", "end_checkpoint_id"),
      expectedShipDate:
        pickValue(raw, "expectedShipDate", "expected_ship_date") ??
        pickValue(
          defaultsForIndex,
          "expectedShipDate",
          "expected_ship_date"
        ),
      estimatedArrivalDate:
        pickValue(raw, "estimatedArrivalDate", "estimated_arrival_date") ??
        pickValue(
          defaultsForIndex,
          "estimatedArrivalDate",
          "estimated_arrival_date"
        ),
      timeTolerance:
        pickValue(raw, "timeTolerance", "time_tolerance") ??
        pickValue(defaultsForIndex, "timeTolerance", "time_tolerance"),
    };

    const parsed = ShipmentCheckpointPayload.parse(candidate);

    return {
      startCheckpointId: normalizeUuid(parsed.startCheckpointId),
      endCheckpointId: normalizeUuid(parsed.endCheckpointId),
      expectedShipDate: toNullableString(parsed.expectedShipDate) ?? EMPTY,
      estimatedArrivalDate:
        toNullableString(parsed.estimatedArrivalDate) ?? EMPTY,
      timeTolerance: toNullableString(parsed.timeTolerance) ?? EMPTY,
    };
  });

  return normalized
    .map((entry, index) => ({ ...entry, _index: index }))
    .sort((a, b) => {
      let compare = a.startCheckpointId.localeCompare(b.startCheckpointId);
      if (compare !== 0) {
        return compare;
      }
      compare = a.endCheckpointId.localeCompare(b.endCheckpointId);
      if (compare !== 0) {
        return compare;
      }
      compare = a.expectedShipDate.localeCompare(b.expectedShipDate);
      if (compare !== 0) {
        return compare;
      }
      compare = a.estimatedArrivalDate.localeCompare(b.estimatedArrivalDate);
      if (compare !== 0) {
        return compare;
      }
      compare = a.timeTolerance.localeCompare(b.timeTolerance);
      if (compare !== 0) {
        return compare;
      }
      return a._index - b._index;
    })
    .map(({ _index, ...rest }) => rest);
}

function valueOrEmpty(value) {
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : EMPTY;
  }
  const str = String(value);
  return str.trim().length === 0 ? EMPTY : str.trim();
}

export function buildShipmentCanonicalPayload(
  shipmentId,
  payload,
  items,
  checkpoints
) {
  return stableStringify({
    id: shipmentId,
    manufacturerUUID: payload.manufacturerUUID ?? EMPTY,
    consumerUUID: payload.consumerUUID ?? EMPTY,
    shipmentItems: items.map((item) => ({
      productUUID: item.productUUID ?? EMPTY,
      quantity: valueOrEmpty(item.quantity),
    })),
    checkpoints: checkpoints.map((cp) => ({
      startCheckpointId: cp.startCheckpointId ?? EMPTY,
      endCheckpointId: cp.endCheckpointId ?? EMPTY,
      expectedShipDate: valueOrEmpty(cp.expectedShipDate),
      estimatedArrivalDate: valueOrEmpty(cp.estimatedArrivalDate),
      timeTolerance: valueOrEmpty(cp.timeTolerance),
    })),
  });
}

export function computeShipmentHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function prepareShipmentPersistence(
  shipmentId,
  rawPayload,
  { shipmentItems = [], checkpoints = [] } = {},
  defaults = {}
) {
  const normalized = normalizeShipmentPayload(rawPayload, defaults);
  const normalizedItems = normalizeShipmentItems(
    shipmentItems,
    defaults.shipmentItems
  );
  const normalizedCheckpoints = normalizeShipmentCheckpoints(
    checkpoints,
    defaults.checkpoints
  );

  const canonical = buildShipmentCanonicalPayload(
    shipmentId,
    normalized,
    normalizedItems,
    normalizedCheckpoints
  );

  return {
    normalized,
    normalizedItems,
    normalizedCheckpoints,
    canonical,
    payloadHash: computeShipmentHashFromCanonical(canonical),
  };
}

export async function ensureShipmentOnChainIntegrity({
  shipmentRecord,
  checkpoints = [],
  shipmentItems = [],
}) {
  if (!shipmentRecord) {
    throw hashMismatch({
      reason: "Shipment record missing",
      code: ShipmentErrorCodes.NOT_FOUND,
    });
  }

  const shipmentId =
    shipmentRecord.id ??
    shipmentRecord.shipment_id ??
    shipmentRecord.shipmentId ??
    null;
  const storedHash =
    shipmentRecord.shipment_hash ?? shipmentRecord.shipmentHash ?? null;

  if (!shipmentId) {
    throw hashMismatch({
      reason: "Shipment record missing id",
      code: ShipmentErrorCodes.NOT_FOUND,
    });
  }

  if (!storedHash) {
    throw hashMismatch({
      reason: "Shipment record missing stored hash",
      code: ShipmentErrorCodes.HASH_MISMATCH,
    });
  }

  const payloadRaw = {
    manufacturerUUID:
      shipmentRecord.manufacturer_uuid ?? shipmentRecord.manufacturerUUID,
    consumerUUID:
      shipmentRecord.consumer_uuid ??
      shipmentRecord.destination_party_uuid ??
      shipmentRecord.consumerUUID ??
      shipmentRecord.destinationPartyUUID,
  };

  const normalized = normalizeShipmentPayload(payloadRaw);
  const normalizedItems = normalizeShipmentItems(shipmentItems);
  const normalizedCheckpoints = normalizeShipmentCheckpoints(checkpoints);

  const canonical = buildShipmentCanonicalPayload(
    shipmentId,
    normalized,
    normalizedItems,
    normalizedCheckpoints
  );

  const computedHash = computeShipmentHashFromCanonical(canonical);
  const normalizedComputed = normalizeHash(computedHash);
  const normalizedStored = normalizeHash(storedHash);

  if (normalizedStored !== normalizedComputed) {
    throw hashMismatch({
      reason: "Stored hash does not match recomputed payload",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ShipmentErrorCodes.HASH_MISMATCH,
    });
  }

  const onChain = await fetchShipmentOnChain(uuidToBytes16Hex(shipmentId));
  if (!onChain.hash) {
    throw hashMismatch({
      reason: "Shipment not found on-chain",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: ShipmentErrorCodes.HASH_MISMATCH,
    });
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain shipment hash mismatch",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
      code: ShipmentErrorCodes.HASH_MISMATCH,
    });
  }

  return {
    canonical,
    normalizedPayload: normalized,
    normalizedItems,
    normalizedCheckpoints,
    hash: normalizedComputed,
  };
}

export function formatShipmentRecord(record) {
  if (!record) {
    return null;
  }

  const consumer =
    record.consumer_uuid ??
    record.destination_party_uuid ??
    record.consumerUUID ??
    record.destinationPartyUUID ??
    null;

  return {
    id: record.id ?? record.shipment_id ?? record.shipmentId ?? null,
    manufacturerUUID: record.manufacturer_uuid ?? record.manufacturerUUID ?? null,
    consumerUUID: consumer,
    shipmentHash: normalizeHash(record.shipment_hash ?? record.shipmentHash ?? null),
    txHash: record.tx_hash ?? record.transaction_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}
