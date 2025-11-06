import { randomUUID } from "node:crypto";
import { normalizeHash } from "../utils/hash.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { runInTransaction } from "../utils/dbTransactions.js";
import {
  insertShipmentSegment,
  listShipmentSegmentsByShipmentId,
  listShipmentSegmentsByStatusWithDetails,
  updateShipmentSegmentRecord,
  deleteShipmentSegmentsByShipmentId as modelDeleteSegments,
  findShipmentSegmentById,
} from "../models/ShipmentSegmentModel.js";
import {
  summarizePackagesByShipmentId,
  listPackagesByShipmentUuid,
} from "../models/PackageRegistryModel.js";
import {
  getShipmentById,
  updateShipment as updateShipmentRecord,
} from "../models/ShipmentRegistryModel.js";
import {
  prepareShipmentSegmentPersistence,
  formatShipmentSegmentRecord,
  ensureShipmentSegmentOnChainIntegrity,
} from "./shipmentSegmentIntegrityService.js";
import {
  prepareShipmentPersistence,
  formatShipmentRecord,
} from "./shipmentIntegrityService.js";
import {
  registerShipmentSegmentOnChain,
  updateShipmentSegmentOnChain,
} from "../eth/shipmentSegmentContract.js";
import {
  updateShipmentOnChain,
  shipmentOperatorAddress,
} from "../eth/shipmentContract.js";
import { updatePackageStatusForShipment } from "./packageRegistryService.js";
import { findCheckpointById } from "../models/CheckpointRegistryModel.js";
import { calculateDistanceInKilometers } from "../utils/geo.js";
import {
  shipmentSegmentNotFound,
  hashMismatch,
  shipmentSegmentConflict,
  shipmentSegmentAccessDenied,
} from "../errors/shipmentSegmentErrors.js";
import {
  shipmentNotFound,
  hashMismatch as shipmentHashMismatch,
} from "../errors/shipmentErrors.js";
import {
  registrationRequired,
  manufacturerForbidden,
} from "../errors/packageErrors.js";

const PINATA_ENTITY = "shipment_segment";

function determineShipmentStatusFromSegments(segments) {
  const statuses = Array.isArray(segments)
    ? segments
        .map((segment) => {
          const value =
            segment?.status ??
            segment?.STATUS ??
            null;
          if (typeof value !== "string") {
            return null;
          }
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed.toUpperCase() : null;
        })
        .filter((status) => status !== null)
    : [];

  if (statuses.length === 0) {
    return null;
  }

  const allDelivered = statuses.every((status) => status === "DELIVERED");
  if (allDelivered) {
    return "DELIVERED";
  }

  const hasInTransit = statuses.some((status) => status === "IN_TRANSIT");
  if (hasInTransit) {
    return "IN_TRANSIT";
  }

  const hasAccepted = statuses.some((status) => status === "ACCEPTED");
  const onlyAcceptedOrPending = statuses.every(
    (status) => status === "ACCEPTED" || status === "PENDING"
  );

  if (hasAccepted && onlyAcceptedOrPending) {
    return "ACCEPTED";
  }

  return null;
}

function mapSegmentsToCheckpoints(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.map((segment) => ({
    startCheckpointId: segment.start_checkpoint_id ?? null,
    endCheckpointId: segment.end_checkpoint_id ?? null,
    expectedShipDate: segment.expected_ship_date ?? null,
    estimatedArrivalDate: segment.estimated_arrival_date ?? null,
    timeTolerance: segment.time_tolerance ?? null,
    segmentOrder:
      typeof segment.segment_order === "number"
        ? segment.segment_order
        : Number.isFinite(Number(segment.segment_order))
          ? Number(segment.segment_order)
          : null,
  }));
}

function mapPackagesToShipmentItems(packages) {
  if (!Array.isArray(packages)) {
    return [];
  }

  return packages.map((pkg) => ({
    packageUUID: pkg.id ?? null,
    quantity:
      pkg.quantity !== undefined && pkg.quantity !== null
        ? Number(pkg.quantity)
        : null,
  }));
}

function resolveShipmentUpdatedBy(walletAddress) {
  if (
    walletAddress &&
    typeof walletAddress === "string" &&
    walletAddress.trim().length > 0
  ) {
    return walletAddress;
  }
  return shipmentOperatorAddress ?? null;
}

async function reconcileShipmentState({
  shipmentId,
  walletAddress,
  client,
}) {
  const segments = await listShipmentSegmentsByShipmentId(shipmentId, client);
  const computedShipmentStatus = determineShipmentStatusFromSegments(segments);

  if (!computedShipmentStatus) {
    return {
      shipmentUpdate: null,
      packageUpdates: [],
    };
  }

  const shipmentRecord = await getShipmentById(shipmentId, client);
  if (!shipmentRecord) {
    throw shipmentNotFound();
  }

  const existingShipmentStatus =
    typeof shipmentRecord.status === "string"
      ? shipmentRecord.status.trim().toUpperCase()
      : null;

  const shipmentStatusChanged =
    existingShipmentStatus !== computedShipmentStatus;

  const packages = await listPackagesByShipmentUuid(shipmentId, client);
  const shipmentItems = mapPackagesToShipmentItems(packages);
  const checkpoints = mapSegmentsToCheckpoints(segments);

  if (shipmentStatusChanged) {
    const {
      normalized,
      normalizedItems,
      normalizedCheckpoints,
      canonical,
      payloadHash,
    } = prepareShipmentPersistence(
      shipmentId,
      {
        manufacturerUUID:
          shipmentRecord.manufacturer_uuid ??
          shipmentRecord.manufacturerUUID ??
          null,
        consumerUUID:
          shipmentRecord.consumer_uuid ??
          shipmentRecord.destination_party_uuid ??
          shipmentRecord.consumerUUID ??
          shipmentRecord.destinationPartyUUID ??
          null,
        status: computedShipmentStatus,
      },
      {
        shipmentItems,
        checkpoints,
      },
    );

    const { txHash, shipmentHash } = await updateShipmentOnChain(
      uuidToBytes16Hex(shipmentId),
      payloadHash
    );

    const normalizedOnChain = shipmentHash
      ? normalizeHash(shipmentHash)
      : normalizeHash(payloadHash);
    const normalizedComputed = normalizeHash(payloadHash);

    if (normalizedOnChain !== normalizedComputed) {
      throw shipmentHashMismatch({
        reason:
          "On-chain shipment hash mismatch detected during segment status update",
        onChain: normalizedOnChain,
        computed: normalizedComputed,
      });
    }

    const pinataBackup = await backupRecordSafely({
      entity: "shipment",
      record: {
        id: shipmentId,
        manufacturerUUID: normalized.manufacturerUUID,
        consumerUUID: normalized.consumerUUID,
        payloadCanonical: canonical,
        payloadHash,
        payload: {
          ...normalized,
          shipmentItems: normalizedItems,
          checkpoints: normalizedCheckpoints,
        },
        txHash,
      },
      walletAddress,
      operation: "update",
      identifier: shipmentId,
      errorMessage:
        "?? Failed to back up shipment status update to Pinata:",
    });

    const updatedShipmentRecord = await updateShipmentRecord(
      shipmentId,
      {
        manufacturerUUID: normalized.manufacturerUUID,
        consumerUUID: normalized.consumerUUID,
        status: normalized.status,
        shipment_hash: payloadHash,
        tx_hash: txHash,
        updated_by: resolveShipmentUpdatedBy(walletAddress),
        pinata_cid:
          pinataBackup?.IpfsHash ??
          shipmentRecord.pinata_cid ??
          null,
        pinata_pinned_at: pinataBackup?.Timestamp
          ? new Date(pinataBackup.Timestamp)
          : shipmentRecord.pinata_pinned_at ?? null,
      },
      client
    );

    const formattedShipment = formatShipmentRecord(updatedShipmentRecord);
    const shipmentResponse = {
      ...formattedShipment,
      pinataCid:
        formattedShipment.pinataCid ??
        pinataBackup?.IpfsHash ??
        null,
      pinataPinnedAt:
        formattedShipment.pinataPinnedAt ??
        (pinataBackup?.Timestamp
          ? new Date(pinataBackup.Timestamp)
          : null),
    };

    const packageStatusMap = {
      ACCEPTED: "PACKAGE_ACCEPTED",
      IN_TRANSIT: "PACKAGE_IN_TRANSIT",
      DELIVERED: "PACKAGE_DELIVERED",
    };

    const nextPackageStatus = packageStatusMap[computedShipmentStatus] ?? null;
    let packageUpdates = [];

    if (nextPackageStatus) {
      const packageResults = await Promise.all(
        packages.map(async (pkg) => {
          const result = await updatePackageStatusForShipment({
            packageId: pkg.id,
            status: nextPackageStatus,
            wallet: walletAddress ? { walletAddress } : null,
            dbClient: client,
          });
          if (!result) {
            return null;
          }
          return {
            updated: result.updated ?? false,
            status: result.record?.status ?? nextPackageStatus,
            record: result.record ?? null,
            txHash: result.txHash ?? null,
            hash: result.hash ?? null,
            pinataCid: result.pinataCid ?? null,
          };
        })
      );

      packageUpdates = packageResults.filter(
        (entry) => entry !== null
      );
    }

    return {
      shipmentUpdate: {
        updated: true,
        status: computedShipmentStatus,
        record: shipmentResponse,
      },
      packageUpdates,
    };
  }

  return {
    shipmentUpdate: {
      updated: false,
      status: computedShipmentStatus,
      record: formatShipmentRecord(shipmentRecord),
    },
    packageUpdates: [],
  };
}

async function performSegmentStatusTransition({
  segmentId,
  registration,
  walletAddress,
  client,
  allowedStatuses,
  nextStatus,
  assignSupplier = false,
  requireExistingSupplier = false,
  beforeUpdate = null,
}) {
  if (!registration?.id) {
    throw registrationRequired();
  }

  const existing = await findShipmentSegmentById(segmentId, client);
  if (!existing) {
    throw shipmentSegmentNotFound();
  }

  const shipmentId = existing.shipment_id ?? null;
  if (!shipmentId) {
    throw shipmentNotFound();
  }

  const currentStatus =
    typeof existing.status === "string"
      ? existing.status.trim().toUpperCase()
      : null;

  if (
    currentStatus &&
    Array.isArray(allowedStatuses) &&
    !allowedStatuses.includes(currentStatus)
  ) {
    throw shipmentSegmentConflict(
      `Cannot transition shipment segment in status ${currentStatus}`
    );
  }

  const normalizedSupplier = registration.id.trim().toLowerCase();
  const existingSupplier =
    typeof existing.supplier_id === "string"
      ? existing.supplier_id.trim().toLowerCase()
      : null;

  if (existingSupplier && existingSupplier !== normalizedSupplier) {
    throw shipmentSegmentConflict(
      "Shipment segment is already assigned to another supplier"
    );
  }

  if (requireExistingSupplier && !existingSupplier) {
    throw shipmentSegmentConflict(
      "Shipment segment is not assigned to this supplier"
    );
  }

  if (typeof beforeUpdate === "function") {
    await beforeUpdate({
      segment: existing,
      client,
    });
  }

  const supplierIdForUpdate = assignSupplier
    ? registration.id
    : existing.supplier_id ?? registration.id;

  const updatedSegment = await updateShipmentSegmentStatus({
    segmentId,
    status: nextStatus,
    supplierId: supplierIdForUpdate,
    walletAddress,
    dbClient: client,
  });

  const { shipmentUpdate, packageUpdates } = await reconcileShipmentState({
    shipmentId,
    walletAddress,
    client,
  });

  return {
    segment: updatedSegment,
    shipment: shipmentUpdate,
    packages: packageUpdates,
  };
}

async function ensureTakeoverLocationWithinRange({
  segment,
  client,
  currentLatitude,
  currentLongitude,
}) {
  const checkpointId = segment.start_checkpoint_id ?? null;
  if (!checkpointId) {
    throw shipmentSegmentConflict(
      "Shipment segment missing start checkpoint information"
    );
  }

  const checkpoint = await findCheckpointById(checkpointId, client);
  if (!checkpoint) {
    throw shipmentSegmentConflict("Start checkpoint not found for segment");
  }

  const checkpointLatitude = Number(
    typeof checkpoint.latitude === "string"
      ? checkpoint.latitude.trim()
      : checkpoint.latitude
  );
  const checkpointLongitude = Number(
    typeof checkpoint.longitude === "string"
      ? checkpoint.longitude.trim()
      : checkpoint.longitude
  );

  if (
    !Number.isFinite(checkpointLatitude) ||
    !Number.isFinite(checkpointLongitude)
  ) {
    throw shipmentSegmentConflict(
      "Start checkpoint does not have valid coordinates"
    );
  }

  const distanceKm = calculateDistanceInKilometers(
    checkpointLatitude,
    checkpointLongitude,
    currentLatitude,
    currentLongitude
  );

  if (!Number.isFinite(distanceKm) || distanceKm > 1) {
    throw shipmentSegmentAccessDenied(
      "Access denied: location is not within 1km of the origin checkpoint"
    );
  }
}

async function ensureHandoverLocationWithinRange({
  segment,
  client,
  currentLatitude,
  currentLongitude,
}) {
  const checkpointId = segment.end_checkpoint_id ?? null;
  if (!checkpointId) {
    throw shipmentSegmentConflict(
      "Shipment segment missing end checkpoint information"
    );
  }

  const checkpoint = await findCheckpointById(checkpointId, client);
  if (!checkpoint) {
    throw shipmentSegmentConflict("End checkpoint not found for segment");
  }

  const checkpointLatitude = Number(
    typeof checkpoint.latitude === "string"
      ? checkpoint.latitude.trim()
      : checkpoint.latitude
  );
  const checkpointLongitude = Number(
    typeof checkpoint.longitude === "string"
      ? checkpoint.longitude.trim()
      : checkpoint.longitude
  );

  if (
    !Number.isFinite(checkpointLatitude) ||
    !Number.isFinite(checkpointLongitude)
  ) {
    throw shipmentSegmentConflict(
      "End checkpoint does not have valid coordinates"
    );
  }

  const distanceKm = calculateDistanceInKilometers(
    checkpointLatitude,
    checkpointLongitude,
    currentLatitude,
    currentLongitude
  );

  if (!Number.isFinite(distanceKm) || distanceKm > 1) {
    throw shipmentSegmentAccessDenied(
      "Access denied: location is not within 1km of the destination checkpoint"
    );
  }
}
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

export async function takeoverShipmentSegment({
  segmentId,
  registration,
  walletAddress = null,
  latitude,
  longitude,
}) {
  if (!segmentId) {
    throw shipmentSegmentNotFound();
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw shipmentSegmentConflict("Latitude and longitude are required");
  }

  return runInTransaction(async (client) => {
    return performSegmentStatusTransition({
      segmentId,
      registration,
      walletAddress,
      client,
      allowedStatuses: ["PENDING", "ACCEPTED"],
      nextStatus: "IN_TRANSIT",
      assignSupplier: true,
      beforeUpdate: async ({ segment }) => {
        await ensureTakeoverLocationWithinRange({
          segment,
          client,
          currentLatitude: latitude,
          currentLongitude: longitude,
        });
      },
    });
  });
}

export async function handoverShipmentSegment({
  segmentId,
  registration,
  walletAddress = null,
  latitude,
  longitude,
}) {
  if (!segmentId) {
    throw shipmentSegmentNotFound();
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw shipmentSegmentConflict("Latitude and longitude are required");
  }

  return runInTransaction(async (client) => {
    return performSegmentStatusTransition({
      segmentId,
      registration,
      walletAddress,
      client,
      allowedStatuses: ["IN_TRANSIT"],
      nextStatus: "DELIVERED",
      assignSupplier: false,
      requireExistingSupplier: true,
      beforeUpdate: async ({ segment }) => {
        await ensureHandoverLocationWithinRange({
          segment,
          client,
          currentLatitude: latitude,
          currentLongitude: longitude,
        });
      },
    });
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
