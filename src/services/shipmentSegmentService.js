import { randomUUID } from "node:crypto";
import { normalizeHash } from "../utils/hash.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import {
  insertShipmentSegment,
  listShipmentSegmentsByShipmentId,
  updateShipmentSegmentRecord,
  deleteShipmentSegmentsByShipmentId as modelDeleteSegments,
  findShipmentSegmentById,
} from "../models/ShipmentSegmentModel.js";
import {
  prepareShipmentSegmentPersistence,
  formatShipmentSegmentRecord,
  ensureShipmentSegmentOnChainIntegrity,
} from "./shipmentSegmentIntegrityService.js";
import {
  registerShipmentSegmentOnChain,
  updateShipmentSegmentOnChain,
} from "../eth/shipmentSegmentContract.js";
import {
  shipmentSegmentNotFound,
  hashMismatch,
} from "../errors/shipmentSegmentErrors.js";

const PINATA_ENTITY = "shipment_segment";

export async function createShipmentSegment({
  shipmentId,
  startCheckpointId,
  endCheckpointId,
  expectedShipDate,
  estimatedArrivalDate,
  timeTolerance,
  supplierId = null,
  segmentOrder,
  status = "PENDING",
  walletAddress = null,
  dbClient = null,
}) {
  const segmentId = randomUUID();
  const effectiveOrder = segmentOrder ?? 1;

  const { normalized, canonical, payloadHash } =
    prepareShipmentSegmentPersistence(segmentId, {
      shipmentId,
      startCheckpointId,
      endCheckpointId,
      expectedShipDate,
      estimatedArrivalDate,
      timeTolerance,
      supplierId,
      segmentOrder: effectiveOrder,
      status,
    });

  const { txHash, segmentHash } = await registerShipmentSegmentOnChain(
    uuidToBytes16Hex(segmentId),
    payloadHash
  );

  const normalizedOnChain = normalizeHash(segmentHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain segment hash mismatch detected during registration",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: PINATA_ENTITY,
    record: {
      id: segmentId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress,
    operation: "create",
    identifier: segmentId,
    errorMessage: "⚠️ Failed to back up shipment segment to Pinata:",
  });

  const record = await insertShipmentSegment({
    id: segmentId,
    shipmentId: normalized.shipmentId,
    startCheckpointId: normalized.startCheckpointId,
    endCheckpointId: normalized.endCheckpointId,
    expectedShipDate: normalized.expectedShipDate,
    estimatedArrivalDate: normalized.estimatedArrivalDate,
    timeTolerance: normalized.timeTolerance ?? null,
    supplierId: normalized.supplierId ?? null,
    segmentOrder: normalized.segmentOrder ?? effectiveOrder,
    status: normalized.status,
    segmentHash: payloadHash,
    txHash,
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
  }, dbClient);

  return formatShipmentSegmentRecord(record);
}

export async function listShipmentSegmentsForShipment(shipmentId, dbClient = null) {
  const rows = await listShipmentSegmentsByShipmentId(shipmentId, dbClient);

  return Promise.all(
    rows.map(async (row) => {
      const { hash } = await ensureShipmentSegmentOnChainIntegrity(row);
      const formatted = formatShipmentSegmentRecord(row);
      return {
        ...formatted,
        segmentHash: hash,
      };
    })
  );
}

export async function updateShipmentSegmentStatus({
  segmentId,
  status,
  supplierId,
  walletAddress = null,
  dbClient = null,
}) {
  const existing = await findShipmentSegmentById(segmentId, dbClient);
  if (!existing) {
    throw shipmentSegmentNotFound();
  }

  const defaults = {
    shipmentId: existing.shipment_id ?? null,
    startCheckpointId: existing.start_checkpoint_id ?? null,
    endCheckpointId: existing.end_checkpoint_id ?? null,
    expectedShipDate: existing.expected_ship_date ?? null,
    estimatedArrivalDate: existing.estimated_arrival_date ?? null,
    timeTolerance: existing.time_tolerance ?? null,
    supplierId: supplierId ?? existing.supplier_id ?? null,
    segmentOrder: existing.segment_order ?? null,
    status,
  };

  const { normalized, canonical, payloadHash } =
    prepareShipmentSegmentPersistence(segmentId, defaults);

  const { txHash, segmentHash } = await updateShipmentSegmentOnChain(
    uuidToBytes16Hex(segmentId),
    payloadHash
  );

  const normalizedOnChain = segmentHash
    ? normalizeHash(segmentHash)
    : normalizeHash(payloadHash);
  const normalizedComputed = normalizeHash(payloadHash);

  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain segment hash mismatch detected during update",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: PINATA_ENTITY,
    record: {
      id: segmentId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress,
    operation: "update",
    identifier: segmentId,
    errorMessage: "⚠️ Failed to back up shipment segment update to Pinata:",
  });

  const updated = await updateShipmentSegmentRecord({
    segmentId,
    status: normalized.status,
    supplierId: normalized.supplierId ?? null,
    segmentOrder: normalized.segmentOrder ?? null,
    segmentHash: payloadHash,
    txHash,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : existing.pinata_pinned_at ?? null,
  }, dbClient);

  return formatShipmentSegmentRecord(updated);
}

export async function deleteShipmentSegmentsByShipmentId(shipmentId, dbClient) {
  await modelDeleteSegments(shipmentId, dbClient);
}
