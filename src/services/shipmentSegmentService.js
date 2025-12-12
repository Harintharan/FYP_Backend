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
  findShipmentSegmentDetailsById,
  findPreviousShipmentSegment,
  listShipmentSegmentsBySupplierAndStatus,
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
import { SHIPMENT_SEGMENT_STATUS_VALUES } from "../domain/shipmentSegment.schema.js";
import {
  notifySegmentAccepted,
  notifySegmentTakeover,
  notifySegmentHandover,
  notifySegmentDelivered,
  notifyShipmentAccepted,
  notifyShipmentInTransit,
  notifyShipmentDelivered,
} from "./notificationTriggers.js";

const PINATA_ENTITY = "shipment_segment";
const VALID_SEGMENT_STATUSES = new Set(SHIPMENT_SEGMENT_STATUS_VALUES);

function determineShipmentStatusFromSegments(segments) {
  const statuses = Array.isArray(segments)
    ? segments
        .map((segment) => {
          const value = segment?.status ?? segment?.STATUS ?? null;
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

function normalizeSegmentStatus(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
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

async function reconcileShipmentState({ shipmentId, walletAddress, client }) {
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
    // Get wallet addresses from database (already stored as wallet addresses)
    const manufacturerWallet =
      shipmentRecord.manufacturer_uuid ??
      shipmentRecord.manufacturerUUID ??
      null;
    const consumerWallet =
      shipmentRecord.consumer_uuid ??
      shipmentRecord.destination_party_uuid ??
      shipmentRecord.consumerUUID ??
      shipmentRecord.destinationPartyUUID ??
      null;

    // Convert wallet addresses to UUIDs for validation/hashing
    const { query } = await import("../db.js");
    const manufacturerResult = await query(
      `SELECT id FROM users WHERE public_key = $1`,
      [manufacturerWallet]
    );
    const consumerResult = await query(
      `SELECT id FROM users WHERE public_key = $1`,
      [consumerWallet]
    );

    const manufacturerUUID =
      manufacturerResult.rows[0]?.id || manufacturerWallet;
    const consumerUUID = consumerResult.rows[0]?.id || consumerWallet;

    const {
      normalized,
      normalizedItems,
      normalizedCheckpoints,
      canonical,
      payloadHash,
    } = prepareShipmentPersistence(
      shipmentId,
      {
        manufacturerUUID,
        consumerUUID,
        status: computedShipmentStatus,
      },
      {
        shipmentItems,
        checkpoints,
      }
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
        manufacturerUUID: normalized.manufacturerUUID, // Use UUID for Pinata
        consumerUUID: normalized.consumerUUID, // Use UUID for Pinata
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
      errorMessage: "⚠️ Failed to back up shipment status update to Pinata:",
    });

    const updatedShipmentRecord = await updateShipmentRecord(
      shipmentId,
      {
        manufacturerUUID: manufacturerWallet, // Use wallet address for DB
        consumerUUID: consumerWallet, // Use wallet address for DB
        status: normalized.status,
        shipment_hash: payloadHash,
        tx_hash: txHash,
        updated_by: resolveShipmentUpdatedBy(walletAddress),
        pinata_cid: pinataBackup?.IpfsHash ?? shipmentRecord.pinata_cid ?? null,
        pinata_pinned_at: pinataBackup?.Timestamp
          ? new Date(pinataBackup.Timestamp)
          : shipmentRecord.pinata_pinned_at ?? null,
      },
      client
    );

    // Send notification for shipment status change
    const previousStatus = shipmentRecord.status?.toUpperCase();
    const newStatus = computedShipmentStatus;
    if (previousStatus !== newStatus) {
      if (newStatus === "ACCEPTED") {
        notifyShipmentAccepted(shipmentId).catch(console.error);
      } else if (newStatus === "IN_TRANSIT") {
        notifyShipmentInTransit(shipmentId).catch(console.error);
      } else if (newStatus === "DELIVERED") {
        notifyShipmentDelivered(shipmentId).catch(console.error);
      }
    }

    const formattedShipment = formatShipmentRecord(updatedShipmentRecord);
    const shipmentResponse = {
      ...formattedShipment,
      pinataCid: formattedShipment.pinataCid ?? pinataBackup?.IpfsHash ?? null,
      pinataPinnedAt:
        formattedShipment.pinataPinnedAt ??
        (pinataBackup?.Timestamp ? new Date(pinataBackup.Timestamp) : null),
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

      packageUpdates = packageResults.filter((entry) => entry !== null);
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
  shouldUpdateShipment = null,
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

  let allowShipmentUpdate = true;
  if (typeof shouldUpdateShipment === "function") {
    const result = await shouldUpdateShipment({
      segment: existing,
      shipmentId,
      client,
    });
    allowShipmentUpdate = Boolean(result);
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

  // Send notification for segment status change
  if (nextStatus === "ACCEPTED") {
    notifySegmentAccepted(segmentId, supplierIdForUpdate).catch(console.error);
  } else if (nextStatus === "IN_TRANSIT" && currentStatus !== "IN_TRANSIT") {
    notifySegmentTakeover(segmentId, supplierIdForUpdate).catch(console.error);
  } else if (nextStatus === "DELIVERED") {
    notifySegmentDelivered(segmentId).catch(console.error);
  }

  let shipmentUpdate = null;
  let packageUpdates = [];

  if (allowShipmentUpdate) {
    const reconciliation = await reconcileShipmentState({
      shipmentId,
      walletAddress,
      client,
    });
    shipmentUpdate = reconciliation.shipmentUpdate;
    packageUpdates = reconciliation.packageUpdates;
  }

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

async function ensurePreviousSegmentsDelivered({ segment, client }) {
  const shipmentId = segment.shipment_id ?? null;
  if (!shipmentId) {
    throw shipmentNotFound();
  }

  const rawOrder =
    typeof segment.segment_order === "number"
      ? segment.segment_order
      : Number(segment.segment_order);
  if (!Number.isFinite(rawOrder) || rawOrder <= 1) {
    return;
  }

  const previousSegment = await findPreviousShipmentSegment({
    shipmentId,
    segmentOrder: rawOrder,
    dbClient: client,
  });

  if (!previousSegment) {
    throw shipmentSegmentConflict(
      "Cannot take over segment until earlier segments are recorded"
    );
  }

  const previousStatus = normalizeSegmentStatus(previousSegment.status);
  if (previousStatus !== "DELIVERED") {
    throw shipmentSegmentConflict(
      "Cannot take over segment until the previous segment is DELIVERED"
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

  const record = await insertShipmentSegment(
    {
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
    },
    dbClient
  );

  return formatShipmentSegmentRecord(record);
}

export async function listShipmentSegmentsForShipment(
  shipmentId,
  dbClient = null
) {
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

  const updated = await updateShipmentSegmentRecord(
    {
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
    },
    dbClient
  );

  return formatShipmentSegmentRecord(updated);
}

export async function acceptShipmentSegment({
  segmentId,
  registration,
  walletAddress = null,
  dbClient = null,
}) {
  if (!segmentId) {
    throw shipmentSegmentNotFound();
  }

  if (!registration?.id) {
    throw registrationRequired();
  }

  const executor = dbClient
    ? async (task) => task(dbClient)
    : async (task) => runInTransaction(task);

  return executor(async (client) =>
    performSegmentStatusTransition({
      segmentId,
      registration,
      walletAddress,
      client,
      allowedStatuses: ["PENDING"],
      nextStatus: "ACCEPTED",
      assignSupplier: true,
      shouldUpdateShipment: async ({ segment, shipmentId, client }) => {
        if (!shipmentId) {
          throw shipmentNotFound();
        }

        const segmentOrder =
          typeof segment.segment_order === "number"
            ? segment.segment_order
            : Number(segment.segment_order);

        if (!Number.isFinite(segmentOrder) || segmentOrder !== 1) {
          return false;
        }

        const shipmentRecord = await getShipmentById(shipmentId, client);
        if (!shipmentRecord) {
          throw shipmentNotFound();
        }

        const currentStatus =
          typeof shipmentRecord.status === "string"
            ? shipmentRecord.status.trim().toUpperCase()
            : null;

        return currentStatus === "PENDING";
      },
    })
  );
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
        await ensurePreviousSegmentsDelivered({
          segment,
          client,
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
    const result = await performSegmentStatusTransition({
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
        await ensurePreviousSegmentsDelivered({
          segment,
          client,
        });
      },
    });

    // Send handover notification
    notifySegmentHandover(segmentId, registration.id).catch(console.error);

    return result;
  });
}

export async function listSupplierShipmentSegments({
  supplierId,
  status = null,
  cursor = null,
  limit = 20,
}) {
  if (!supplierId) {
    throw registrationRequired();
  }

  const normalizedStatus = normalizeSegmentStatus(status);
  if (normalizedStatus && !VALID_SEGMENT_STATUSES.has(normalizedStatus)) {
    throw shipmentSegmentConflict(
      `Unsupported segment status filter: ${status}`
    );
  }

  const shouldFilterBySupplier = normalizedStatus !== "PENDING";

  const rows = await listShipmentSegmentsBySupplierAndStatus({
    supplierId,
    status: normalizedStatus ?? null,
    filterBySupplier: shouldFilterBySupplier,
    cursor,
    limit,
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const mapped = sliced.map((row) => {
    const statusValue = normalizeSegmentStatus(row.status);
    const previousStatus = normalizeSegmentStatus(row.previous_segment_status);
    const rawOrder =
      typeof row.segment_order === "number"
        ? row.segment_order
        : Number(row.segment_order);
    const segmentOrder = Number.isFinite(rawOrder) ? rawOrder : null;
    const isFirstSegment = segmentOrder === null ? true : segmentOrder <= 1;
    const previousDelivered = isFirstSegment
      ? true
      : previousStatus === "DELIVERED";
    const canAccept = statusValue === "PENDING";
    const canTakeover =
      previousDelivered &&
      (statusValue === "PENDING" || statusValue === "ACCEPTED");
    const isInTransit = statusValue === "IN_TRANSIT";
    const canHandover = isInTransit;
    const canDeliver = isInTransit;

    return {
      segmentId: row.id ?? row.segment_id ?? null,
      status: statusValue,
      segmentOrder,
      expectedShipDate: row.expected_ship_date ?? null,
      estimatedArrivalDate: row.estimated_arrival_date ?? null,
      timeTolerance: row.time_tolerance ?? null,
      shipment: {
        id: row.shipment_id ?? null,
      consumer: {
        id: row.consumer_uuid ?? null,
        legalName: row.consumer_legal_name ?? null,
      },
    },
    startCheckpoint: {
      id: row.start_checkpoint_id ?? null,
      name: row.start_name ?? null,
      state: row.start_state ?? null,
      country: row.start_country ?? null,
    },
    endCheckpoint: {
      id: row.end_checkpoint_id ?? null,
      name: row.end_name ?? null,
      state: row.end_state ?? null,
      country: row.end_country ?? null,
    },
      actions: {
        canAccept,
        canTakeover,
        canHandover,
        canDeliver,
      },
    };
  });

  const nextCursor =
    hasMore && sliced.length > 0
      ? sliced[sliced.length - 1].created_at ?? null
      : null;

  return { segments: mapped, cursor: nextCursor, hasMore };
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

  const segment = await findShipmentSegmentDetailsById(segmentId);
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

  const rows = await summarizePackagesByShipmentId(shipmentId);

  const packages = rows.map((row) => ({
    productCategory: row.product_category_name ?? null,
    productName: row.product_name ?? null,
    requiredStartTemp: row.required_start_temp ?? null,
    requiredEndTemp: row.required_end_temp ?? null,
    quantity: row.total_quantity ?? 0,
  }));

  const segmentDetails = {
    segmentId: segment.id ?? segment.segment_id ?? null,
    shipmentId: shipmentId ?? null,
    status: normalizeSegmentStatus(segment.status),
    expectedShipDate: segment.expected_ship_date ?? null,
    estimatedArrivalDate: segment.estimated_arrival_date ?? null,
    timeTolerance: segment.time_tolerance ?? null,
    shipment: {
      id: shipmentId ?? null,
      consumer: {
        id: segment.consumer_uuid ?? null,
        legalName: segment.consumer_legal_name ?? null,
      },
      manufacturer: {
        id: segment.manufacturer_uuid ?? null,
        legalName: segment.manufacturer_legal_name ?? null,
      },
    },
    startCheckpoint: {
      id: segment.start_checkpoint_id ?? null,
      name: segment.start_name ?? null,
      state: segment.start_state ?? null,
      address: segment.start_address ?? null,
      country: segment.start_country ?? null,
    },
    endCheckpoint: {
      id: segment.end_checkpoint_id ?? null,
      name: segment.end_name ?? null,
      state: segment.end_state ?? null,
      address: segment.end_address ?? null,
      country: segment.end_country ?? null,
    },
    consumer: {
      id: segment.consumer_uuid ?? null,
      name: segment.consumer_legal_name ?? null,
    },
    manufacturer: {
      id: segment.manufacturer_uuid ?? null,
      name: segment.manufacturer_legal_name ?? null,
    },
  };

  return {
    ...segmentDetails,
    packages,
  };
}
