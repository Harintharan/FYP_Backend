import { randomUUID } from "node:crypto";
import { normalizeHash } from "../utils/hash.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import {
  insertShipmentSegment,
  listShipmentSegmentsByShipmentId,
  listShipmentSegmentsByStatusWithDetails,
  updateShipmentSegmentRecord,
  deleteShipmentSegmentsByShipmentId as modelDeleteSegments,
  findShipmentSegmentById,
} from "../models/ShipmentSegmentModel.js";
import { summarizePackagesByShipmentId } from "../models/PackageRegistryModel.js";
import { getShipmentById } from "../models/ShipmentRegistryModel.js";
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
  shipmentSegmentConflict,
} from "../errors/shipmentSegmentErrors.js";
import { shipmentNotFound } from "../errors/shipmentErrors.js";
import {
  registrationRequired,
  manufacturerForbidden,
} from "../errors/packageErrors.js";

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

export async function acceptShipmentSegment({
  segmentId,
  registration,
  walletAddress = null,
  dbClient = null,
}) {
  if (!registration?.id) {
    throw registrationRequired();
  }

  const existing = await findShipmentSegmentById(segmentId, dbClient);
  if (!existing) {
    throw shipmentSegmentNotFound();
  }

  const currentStatus =
    typeof existing.status === "string"
      ? existing.status.toUpperCase()
      : null;

  if (currentStatus && currentStatus !== "PENDING" && currentStatus !== "ACCEPTED") {
    throw shipmentSegmentConflict(
      `Cannot accept shipment segment in status ${currentStatus}`
    );
  }

  const existingSupplier =
    typeof existing.supplier_id === "string"
      ? existing.supplier_id.toLowerCase()
      : null;
  const requestingSupplier = registration.id.toLowerCase();

  if (existingSupplier && existingSupplier !== requestingSupplier) {
    throw shipmentSegmentConflict(
      "Shipment segment is already assigned to another supplier"
    );
  }

  return updateShipmentSegmentStatus({
    segmentId,
    status: "ACCEPTED",
    supplierId: registration.id,
    walletAddress,
    dbClient,
  });
}

export async function deleteShipmentSegmentsByShipmentId(shipmentId, dbClient) {
  await modelDeleteSegments(shipmentId, dbClient);
}

export async function listPendingShipmentSegmentsWithDetails() {
  const rows = await listShipmentSegmentsByStatusWithDetails("PENDING");

  return Promise.all(
    rows.map(async (row) => {
      const { hash } = await ensureShipmentSegmentOnChainIntegrity(row);
      const formatted = formatShipmentSegmentRecord(row);

      return {
        ...formatted,
        segmentHash: hash,
        expectedShipDate: formatted.expectedShipDate ?? null,
        estimatedArrivalDate: formatted.estimatedArrivalDate ?? null,
        expected_ship_date: formatted.expectedShipDate ?? null,
        estimated_arrival_date: formatted.estimatedArrivalDate ?? null,
        manufacturerUuid: row.manufacturer_uuid ?? null,
        manufacturerLegalName: row.manufacturer_legal_name ?? null,
        startLocation: {
          state: row.start_state ?? null,
          country: row.start_country ?? null,
        },
        endLocation: {
          state: row.end_state ?? null,
          country: row.end_country ?? null,
        },
      };
    })
  );
}

export async function getShipmentSegmentPackageDetails({
  segmentId,
  registration,
}) {
  if (!registration?.id) {
    throw registrationRequired();
  }

  const segment = await findShipmentSegmentById(segmentId);
  if (!segment) {
    throw shipmentSegmentNotFound();
  }

  const shipmentId = segment.shipment_id;
  if (!shipmentId) {
    throw shipmentNotFound();
  }

  const shipment = await getShipmentById(shipmentId);
  if (!shipment) {
    throw shipmentNotFound();
  }

  const normalizeUuid = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : null;

  const manufacturerUuid = normalizeUuid(shipment.manufacturer_uuid);
  const registrationUuid = normalizeUuid(registration.id);

  if (!manufacturerUuid || !registrationUuid || manufacturerUuid !== registrationUuid) {
    throw manufacturerForbidden();
  }

  const rows = await summarizePackagesByShipmentId(shipmentId);

  return rows.map((row) => ({
    productCategory: row.product_category_name ?? null,
    productName: row.product_name ?? null,
    requiredStartTemp: row.required_start_temp ?? null,
    requiredEndTemp: row.required_end_temp ?? null,
    quantity: row.total_quantity ?? 0,
  }));
}
