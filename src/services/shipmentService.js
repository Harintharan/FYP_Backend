import { randomUUID } from "node:crypto";
import { query } from "../db.js";
import {
  createShipment,
  updateShipment as updateShipmentRecord,
  getShipmentById,
  getAllShipments as getAllShipmentRecords,
  listShipmentsByManufacturerId,
} from "../models/ShipmentRegistryModel.js";
import { notifyShipmentCreated } from "./notificationTriggers.js";
import {
  findPackageById,
  listPackagesByShipmentUuid,
  summarizeManufacturerPackagesForShipments,
} from "../models/PackageRegistryModel.js";
import {
  createShipmentSegment,
  listShipmentSegmentsForShipment,
  deleteShipmentSegmentsByShipmentId,
} from "./shipmentSegmentService.js";
import { listShipmentSegmentsByShipmentId as listShipmentSegmentsRawByShipmentId } from "../models/ShipmentSegmentModel.js";
import { backupRecord } from "./pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { runInTransaction } from "../utils/dbTransactions.js";
import { normalizeHash } from "../utils/hash.js";
import {
  prepareShipmentPersistence,
  ensureShipmentOnChainIntegrity,
  formatShipmentRecord,
} from "./shipmentIntegrityService.js";
import {
  registerShipmentOnChain,
  updateShipmentOnChain,
  shipmentOperatorAddress,
} from "../eth/shipmentContract.js";
import { syncPackageShipmentState } from "./packageRegistryService.js";
import { ErrorCodes } from "../errors/errorCodes.js";
import {
  hashMismatch,
  shipmentNotFound,
  shipmentValidationError,
  shipmentConflictError,
  ShipmentErrorCodes,
} from "../errors/shipmentErrors.js";
import { HttpError } from "../utils/httpError.js";
import { ManufacturerShipmentsQuery } from "../domain/shipment.schema.js";

const PACKAGE_STATUS_READY_FOR_SHIPMENT = "PACKAGE_READY_FOR_SHIPMENT";
const REQUIRED_CHECKPOINT_FIELDS = Object.freeze([
  "start_checkpoint_id",
  "end_checkpoint_id",
  "estimated_arrival_date",
  "time_tolerance",
  "expected_ship_date",
]);

function buildPackageMissingError(packageId) {
  return shipmentValidationError(
    `Package ${packageId} not found for shipment allocation`
  );
}

function normalizeShipmentResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const consumerValue =
    payload.consumer_uuid ??
    payload.consumerUUID ??
    payload.destination_party_uuid ??
    payload.destinationPartyUUID ??
    null;

  const normalizedItems = Array.isArray(payload.shipmentItems)
    ? payload.shipmentItems.map((item) => {
        const packageId = item?.package_uuid ?? item?.packageUUID ?? null;
        const quantityValue =
          item && Object.prototype.hasOwnProperty.call(item, "quantity")
            ? item.quantity
            : null;
        return {
          package_uuid: packageId,
          packageUUID: packageId,
          quantity: quantityValue,
        };
      })
    : payload.shipmentItems ?? [];

  return {
    ...payload,
    consumerUUID: consumerValue,
    destinationPartyUUID: consumerValue,
    status:
      typeof payload.status === "string"
        ? payload.status.toUpperCase()
        : typeof payload.shipmentStatus === "string"
        ? payload.shipmentStatus.toUpperCase()
        : "PENDING",
    shipmentItems: normalizedItems,
  };
}

function toNullableTrimmed(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeStatusValue(value) {
  const trimmed = typeof value === "string" ? value.trim() : null;
  return trimmed && trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

function buildCheckpointsFromSegments(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.map((segment) => ({
    start_checkpoint_id: segment.startCheckpointId ?? null,
    start_name: segment.startName ?? null,
    end_checkpoint_id: segment.endCheckpointId ?? null,
    end_name: segment.endName ?? null,
    estimated_arrival_date: segment.estimatedArrivalDate ?? null,
    time_tolerance: segment.timeTolerance ?? null,
    expected_ship_date: segment.expectedShipDate ?? null,
    segment_order: segment.segmentOrder ?? null,
  }));
}

function buildCanonicalCheckpointsFromSegments(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.map((segment) => ({
    start_checkpoint_id: segment.startCheckpointId ?? null,
    end_checkpoint_id: segment.endCheckpointId ?? null,
    estimated_arrival_date: segment.estimatedArrivalDate ?? null,
    time_tolerance: segment.timeTolerance ?? null,
    expected_ship_date: segment.expectedShipDate ?? null,
    segment_order: segment.segmentOrder ?? null,
  }));
}

async function assertCheckpointExists(checkpointId) {
  const { rows } = await query(
    `SELECT 1 FROM checkpoint_registry WHERE id = $1`,
    [checkpointId]
  );
  return rows.length > 0;
}

function normalizeQuantity(rawQuantity, index) {
  if (rawQuantity === undefined || rawQuantity === null || rawQuantity === "") {
    return null;
  }

  const parsed = Number(rawQuantity);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw shipmentValidationError(
      `shipmentItems[${index}].quantity must be a non-negative number`
    );
  }

  return Math.trunc(parsed);
}

async function normalizeShipmentItemsInput(
  shipmentItems,
  manufacturerUUID,
  currentShipmentId = null
) {
  if (!Array.isArray(shipmentItems)) {
    return [];
  }

  const normalized = [];
  for (const [index, item] of shipmentItems.entries()) {
    const packageIdRaw =
      item?.package_uuid ??
      item?.packageUUID ??
      item?.packageId ??
      item?.package_id ??
      item?.id ??
      null;

    if (!packageIdRaw || typeof packageIdRaw !== "string") {
      throw shipmentValidationError(
        `shipmentItems[${index}].packageUUID is required`
      );
    }

    const packageId = packageIdRaw.trim();
    const product = await findPackageById(packageId);
    if (!product) {
      throw shipmentValidationError(
        `shipmentItems[${index}].packageUUID does not exist`
      );
    }

    if (
      typeof manufacturerUUID === "string" &&
      product.manufacturer_uuid &&
      product.manufacturer_uuid.toLowerCase() !== manufacturerUUID.toLowerCase()
    ) {
      throw shipmentValidationError(
        `shipmentItems[${index}].packageUUID belongs to a different manufacturer`
      );
    }

    if (
      product.shipment_id &&
      (!currentShipmentId ||
        product.shipment_id.toLowerCase() !== currentShipmentId.toLowerCase())
    ) {
      throw shipmentConflictError(
        `shipmentItems[${index}].packageUUID is already assigned to another shipment`
      );
    }

    const currentStatus = product.status ?? null;
    const isSameShipment =
      currentShipmentId &&
      product.shipment_id &&
      product.shipment_id.toLowerCase() === currentShipmentId.toLowerCase();

    if (
      !isSameShipment &&
      currentStatus !== PACKAGE_STATUS_READY_FOR_SHIPMENT
    ) {
      throw shipmentConflictError(
        `shipmentItems[${index}].packageUUID must be in status ${PACKAGE_STATUS_READY_FOR_SHIPMENT}`
      );
    }

    let quantityValue = null;
    if (Object.prototype.hasOwnProperty.call(item ?? {}, "quantity")) {
      quantityValue = normalizeQuantity(item?.quantity, index);
    }

    if (
      quantityValue === null &&
      product.quantity !== undefined &&
      product.quantity !== null
    ) {
      const parsed = Number(product.quantity);
      quantityValue = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }

    normalized.push({
      package_uuid: product.id,
      packageUUID: product.id,
      quantity: quantityValue,
    });
  }

  return normalized;
}

function requireShipmentEndpoints(payload) {
  const manufacturerUUID =
    payload?.manufacturerUUID ?? payload?.manufacturer_uuid ?? null;
  const consumerUUID =
    payload?.consumerUUID ??
    payload?.consumer_uuid ??
    payload?.destinationPartyUUID ??
    payload?.destination_party_uuid ??
    null;
  const statusCandidate = payload?.status ?? payload?.shipmentStatus ?? null;

  if (!manufacturerUUID || !consumerUUID) {
    throw shipmentValidationError(
      "manufacturerUUID and consumerUUID are required"
    );
  }

  return {
    manufacturerUUID,
    consumerUUID,
    status: typeof statusCandidate === "string" ? statusCandidate : null,
  };
}

async function validateCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    throw shipmentValidationError("At least one checkpoint is required");
  }

  for (const [index, checkpoint] of checkpoints.entries()) {
    for (const field of REQUIRED_CHECKPOINT_FIELDS) {
      if (!checkpoint[field]) {
        throw shipmentValidationError(
          `checkpoints[${index}] missing required field: ${field}`
        );
      }
    }

    const startExists = await assertCheckpointExists(
      checkpoint.start_checkpoint_id
    );
    if (!startExists) {
      throw shipmentValidationError(
        `checkpoints[${index}].start_checkpoint_id does not exist`
      );
    }

    const endExists = await assertCheckpointExists(
      checkpoint.end_checkpoint_id
    );
    if (!endExists) {
      throw shipmentValidationError(
        `checkpoints[${index}].end_checkpoint_id does not exist`
      );
    }
  }
}

function mapAssignedProductsToShipmentItems(assignedProducts) {
  return assignedProducts.map((product) => ({
    package_uuid: product.id,
    packageUUID: product.id,
    quantity:
      product.quantity !== undefined && product.quantity !== null
        ? Number(product.quantity)
        : null,
  }));
}

function appendPinataMetadata(record, pinataBackup) {
  return {
    ...record,
    pinataCid: pinataBackup?.IpfsHash ?? record.pinataCid ?? null,
    pinataTimestamp: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : record.pinataPinnedAt ?? null,
  };
}

function normalizePinataFields(responsePayload) {
  const normalized = { ...responsePayload };
  normalized.pinataCid = responsePayload.pinataCid ?? null;
  normalized.pinataTimestamp = responsePayload.pinataTimestamp ?? null;
  return normalized;
}

function normalizeRegistrationWallet(wallet) {
  return wallet?.walletAddress ?? shipmentOperatorAddress ?? null;
}

function toHttpError(error) {
  if (error instanceof HttpError) {
    return error;
  }
  return new HttpError(500, undefined, {
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
    cause: error,
  });
}

export async function registerShipment({ payload, wallet }) {
  try {
    const {
      manufacturerUUID,
      consumerUUID,
      status: statusCandidate,
    } = requireShipmentEndpoints(payload ?? {});

    // Convert UUIDs to wallet addresses
    const { rows: manufacturerRows } = await query(
      `SELECT public_key FROM users WHERE id = $1`,
      [manufacturerUUID]
    );
    const { rows: consumerRows } = await query(
      `SELECT public_key FROM users WHERE id = $1`,
      [consumerUUID]
    );

    if (!manufacturerRows[0]?.public_key) {
      throw shipmentValidationError(
        `Manufacturer with UUID ${manufacturerUUID} not found`
      );
    }
    if (!consumerRows[0]?.public_key) {
      throw shipmentValidationError(
        `Consumer with UUID ${consumerUUID} not found`
      );
    }

    const manufacturerWallet = manufacturerRows[0].public_key;
    const consumerWallet = consumerRows[0].public_key;

    const statusRaw =
      typeof statusCandidate === "string" && statusCandidate.trim()
        ? statusCandidate
        : "PENDING";

    const shipmentItems = Array.isArray(payload?.shipmentItems)
      ? payload.shipmentItems
      : [];
    if (shipmentItems.length === 0) {
      throw shipmentValidationError("At least one shipment item is required");
    }

    const checkpoints = Array.isArray(payload?.checkpoints)
      ? payload.checkpoints
      : [];

    await validateCheckpoints(checkpoints);

    const normalizedItems = await normalizeShipmentItemsInput(
      shipmentItems,
      manufacturerUUID
    );

    const shipmentId = randomUUID();
    const {
      normalized,
      normalizedItems: canonicalItems,
      normalizedCheckpoints,
      canonical,
      payloadHash,
    } = prepareShipmentPersistence(
      shipmentId,
      { manufacturerUUID, consumerUUID, status: statusRaw },
      {
        shipmentItems: normalizedItems,
        checkpoints,
      }
    );

    const { txHash, shipmentHash } = await registerShipmentOnChain(
      uuidToBytes16Hex(shipmentId),
      payloadHash
    );

    const normalizedOnChain = normalizeHash(shipmentHash);
    const normalizedComputed = normalizeHash(payloadHash);
    if (normalizedOnChain !== normalizedComputed) {
      throw hashMismatch({
        reason: "On-chain shipment hash mismatch detected during registration",
        onChain: normalizedOnChain,
        computed: normalizedComputed,
      });
    }

    const createPayload = {
      id: shipmentId,
      manufacturerUUID: manufacturerWallet, // Use wallet address for DB
      consumerUUID: consumerWallet, // Use wallet address for DB
      status: normalized.status,
      shipment_hash: payloadHash,
      tx_hash: txHash,
      created_by: normalizeRegistrationWallet(wallet),
    };

    let pinataBackup = null;
    try {
      pinataBackup = await backupRecord(
        "shipment",
        {
          ...createPayload,
          manufacturerUUID: normalized.manufacturerUUID, // Use UUID for Pinata
          consumerUUID: normalized.consumerUUID, // Use UUID for Pinata
          payloadCanonical: canonical,
          payloadHash,
          payload: {
            ...normalized,
            shipmentItems: canonicalItems,
            checkpoints: normalizedCheckpoints,
          },
        },
        {
          operation: "create",
          identifier: shipmentId,
        }
      );
    } catch (backupErr) {
      console.error("⚠️ Failed to back up shipment to Pinata:", backupErr);
    }

    let persistedShipment = null;
    try {
      persistedShipment = await runInTransaction(async (client) => {
        const saved = await createShipment(
          {
            ...createPayload,
            pinata_cid: pinataBackup?.IpfsHash ?? null,
            pinata_pinned_at: pinataBackup?.Timestamp ?? null,
          },
          client
        );

        for (const item of normalizedItems) {
          const packageId = item.packageUUID ?? item.package_uuid ?? null;
          if (!packageId) {
            continue;
          }
          await syncPackageShipmentState({
            packageId,
            shipmentId,
            quantity: item.quantity ?? null,
            wallet,
            dbClient: client,
            onMissingPackage: buildPackageMissingError,
          });
        }

        for (const [idx, checkpoint] of checkpoints.entries()) {
          const segmentOrder =
            typeof checkpoint.segment_order === "number"
              ? checkpoint.segment_order
              : typeof checkpoint.segmentOrder === "number"
              ? checkpoint.segmentOrder
              : idx + 1;

          await createShipmentSegment({
            shipmentId,
            startCheckpointId: checkpoint.start_checkpoint_id,
            endCheckpointId: checkpoint.end_checkpoint_id,
            expectedShipDate: checkpoint.expected_ship_date,
            estimatedArrivalDate: checkpoint.estimated_arrival_date,
            timeTolerance: checkpoint.time_tolerance ?? null,
            status: "PENDING",
            segmentOrder,
            walletAddress: wallet?.walletAddress ?? null,
            dbClient: client,
          });
        }

        return saved;
      });
    } catch (transactionErr) {
      console.error(
        "❌ Failed to persist shipment within transaction:",
        transactionErr
      );
      throw transactionErr;
    }

    const formattedShipment = formatShipmentRecord(persistedShipment);
    const [shipmentSegments, assignedProducts] = await Promise.all([
      listShipmentSegmentsForShipment(shipmentId),
      listPackagesByShipmentUuid(shipmentId),
    ]);

    const savedCheckpoints = buildCheckpointsFromSegments(shipmentSegments);
    const shipmentItemsPayload =
      mapAssignedProductsToShipmentItems(assignedProducts);

    const responsePayload = normalizeShipmentResponse(
      appendPinataMetadata(
        {
          ...formattedShipment,
          handover_checkpoints: savedCheckpoints,
          shipmentItems: shipmentItemsPayload,
          shipmentSegments,
          blockchainTx: txHash,
          dbHash: payloadHash,
          blockchainHash: normalizedOnChain,
        },
        {
          IpfsHash: pinataBackup?.IpfsHash ?? null,
          Timestamp: pinataBackup?.Timestamp ?? null,
        }
      )
    );

    responsePayload.pinataCid =
      formattedShipment.pinataCid ?? pinataBackup?.IpfsHash ?? null;
    responsePayload.pinataTimestamp =
      formattedShipment.pinataPinnedAt ??
      (pinataBackup?.Timestamp ? new Date(pinataBackup.Timestamp) : null);

    // Send notification to manufacturer and consumer
    const creatorUserId = wallet?.registration?.id || null;
    notifyShipmentCreated(shipmentId, creatorUserId).catch(console.error);

    return {
      statusCode: 201,
      body: normalizePinataFields(responsePayload),
    };
  } catch (error) {
    throw toHttpError(error);
  }
}

export async function getShipmentDetails({ id }) {
  try {
    if (!id) {
      throw shipmentValidationError("Shipment id is required");
    }

    const shipment = await getShipmentById(id);
    if (!shipment) {
      throw shipmentNotFound();
    }

    // The enhanced getShipmentById now returns segments and packages directly
    // Just return the shipment data without extra transformations
    return {
      statusCode: 200,
      body: shipment,
    };
  } catch (error) {
    throw toHttpError(error);
  }
}

export async function updateShipment({ id, payload, wallet }) {
  try {
    if (!id) {
      throw shipmentValidationError("Shipment id is required");
    }

    const existing = await getShipmentById(id);
    if (!existing) {
      throw shipmentNotFound();
    }

    const {
      manufacturerUUID,
      consumerUUID,
      status: statusCandidate,
    } = requireShipmentEndpoints(payload ?? {});

    const statusRaw =
      typeof statusCandidate === "string" && statusCandidate.trim()
        ? statusCandidate
        : existing.status ?? "PENDING";

    const shipmentItems = Array.isArray(payload?.shipmentItems)
      ? payload.shipmentItems
      : [];
    if (shipmentItems.length === 0) {
      throw shipmentValidationError("At least one shipment item is required");
    }

    const checkpoints = Array.isArray(payload?.checkpoints)
      ? payload.checkpoints
      : [];

    await validateCheckpoints(checkpoints);

    const normalizedItems = await normalizeShipmentItemsInput(
      shipmentItems,
      manufacturerUUID,
      id
    );

    if (
      existing.manufacturer_uuid &&
      existing.manufacturer_uuid.toLowerCase() !==
        manufacturerUUID.toLowerCase()
    ) {
      throw shipmentValidationError(
        "manufacturerUUID cannot be changed for an existing shipment"
      );
    }

    const {
      normalized,
      normalizedItems: canonicalItems,
      normalizedCheckpoints,
      canonical,
      payloadHash,
    } = prepareShipmentPersistence(
      id,
      { manufacturerUUID, consumerUUID, status: statusRaw },
      { shipmentItems: normalizedItems, checkpoints }
    );

    const { txHash, shipmentHash } = await updateShipmentOnChain(
      uuidToBytes16Hex(id),
      payloadHash
    );

    const normalizedOnChain = shipmentHash
      ? normalizeHash(shipmentHash)
      : normalizeHash(payloadHash);
    const normalizedComputed = normalizeHash(payloadHash);
    if (normalizedOnChain !== normalizedComputed) {
      throw hashMismatch({
        reason: "On-chain shipment hash mismatch detected during update",
        onChain: normalizedOnChain,
        computed: normalizedComputed,
      });
    }

    let pinataBackup = null;
    try {
      pinataBackup = await backupRecord(
        "shipment",
        {
          id,
          manufacturerUUID: normalized.manufacturerUUID,
          consumerUUID: normalized.consumerUUID,
          payloadCanonical: canonical,
          payloadHash,
          payload: {
            ...normalized,
            shipmentItems: canonicalItems,
            checkpoints: normalizedCheckpoints,
          },
          txHash,
        },
        {
          operation: "update",
          identifier: id,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up shipment update to Pinata:",
        backupErr
      );
    }

    let updatedShipment = null;
    try {
      updatedShipment = await runInTransaction(async (client) => {
        const updated = await updateShipmentRecord(
          {
            id,
            manufacturerUUID: normalized.manufacturerUUID,
            consumerUUID: normalized.consumerUUID,
            status: normalized.status,
            shipment_hash: payloadHash,
            tx_hash: txHash,
            updated_by: normalizeRegistrationWallet(wallet),
            pinata_cid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
            pinata_pinned_at: pinataBackup?.Timestamp
              ? new Date(pinataBackup.Timestamp)
              : existing.pinata_pinned_at ?? null,
          },
          client
        );

        const existingAssignments = await listPackagesByShipmentUuid(
          id,
          client
        );
        for (const existingPackage of existingAssignments) {
          await syncPackageShipmentState({
            packageId: existingPackage.id,
            shipmentId: null,
            wallet,
            dbClient: client,
            onMissingPackage: buildPackageMissingError,
          });
        }

        for (const item of normalizedItems) {
          const packageId = item.packageUUID ?? item.package_uuid ?? null;
          if (!packageId) {
            continue;
          }
          await syncPackageShipmentState({
            packageId,
            shipmentId: id,
            quantity: item.quantity ?? null,
            wallet,
            dbClient: client,
            onMissingPackage: buildPackageMissingError,
          });
        }

        await deleteShipmentSegmentsByShipmentId(id, client);
        for (const [idx, checkpoint] of checkpoints.entries()) {
          const segmentOrder =
            typeof checkpoint.segment_order === "number"
              ? checkpoint.segment_order
              : typeof checkpoint.segmentOrder === "number"
              ? checkpoint.segmentOrder
              : idx + 1;

          await createShipmentSegment({
            shipmentId: id,
            startCheckpointId: checkpoint.start_checkpoint_id,
            endCheckpointId: checkpoint.end_checkpoint_id,
            expectedShipDate: checkpoint.expected_ship_date,
            estimatedArrivalDate: checkpoint.estimated_arrival_date,
            timeTolerance: checkpoint.time_tolerance ?? null,
            status: "PENDING",
            segmentOrder,
            walletAddress: wallet?.walletAddress ?? null,
            dbClient: client,
          });
        }

        return updated;
      });
    } catch (transactionErr) {
      console.error(
        "❌ Failed to persist shipment update within transaction:",
        transactionErr
      );
      throw transactionErr;
    }

    const formattedShipment = formatShipmentRecord(updatedShipment);
    const [shipmentSegments, assignedProducts] = await Promise.all([
      listShipmentSegmentsForShipment(id),
      listPackagesByShipmentUuid(id),
    ]);

    const savedCheckpoints = buildCheckpointsFromSegments(shipmentSegments);
    const shipmentItemsPayload =
      mapAssignedProductsToShipmentItems(assignedProducts);

    const responsePayload = normalizeShipmentResponse(
      appendPinataMetadata(
        {
          ...formattedShipment,
          handover_checkpoints: savedCheckpoints,
          shipmentItems: shipmentItemsPayload,
          shipmentSegments,
          blockchainTx: txHash,
          dbHash: payloadHash,
          blockchainHash: normalizedOnChain,
        },
        {
          IpfsHash: pinataBackup?.IpfsHash ?? null,
          Timestamp: pinataBackup?.Timestamp ?? null,
        }
      )
    );

    responsePayload.pinataCid =
      formattedShipment.pinataCid ?? pinataBackup?.IpfsHash ?? null;
    responsePayload.pinataTimestamp =
      formattedShipment.pinataPinnedAt ??
      (pinataBackup?.Timestamp ? new Date(pinataBackup.Timestamp) : null);

    return {
      statusCode: 200,
      body: normalizePinataFields(responsePayload),
    };
  } catch (error) {
    throw toHttpError(error);
  }
}

export async function listManufacturerShipments({
  manufacturerId,
  status,
  cursor,
  limit = 20,
}) {
  const parsed = ManufacturerShipmentsQuery.safeParse({
    manufacturerId,
    status,
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues?.[0]?.message ??
      "manufacturerId must be a valid UUID";
    throw shipmentValidationError(message);
  }

  const { manufacturerId: normalizedManufacturerId, status: statusValue } =
    parsed.data;
  const statusFilter =
    typeof statusValue === "string" && statusValue.length > 0
      ? statusValue
      : null;

  const shipments = await listShipmentsByManufacturerId(
    normalizedManufacturerId,
    { status: statusFilter, cursor, limit }
  );

  // Check if we have more results (we fetched limit + 1)
  const hasMore = shipments.length > limit;
  const actualShipments = hasMore ? shipments.slice(0, limit) : shipments;

  const result = actualShipments.map((shipment) => {
    const consumerId =
      shipment.consumer_uuid ??
      shipment.consumerUUID ??
      shipment.destination_party_uuid ??
      shipment.destinationPartyUUID ??
      null;

    const consumerName =
      shipment.consumer_company_name ?? shipment.consumer_legal_name ?? null;

    const segments = Array.isArray(shipment.segments) ? shipment.segments : [];

    const shipmentItems = Array.isArray(shipment.shipment_items)
      ? shipment.shipment_items
      : [];

    return {
      id: shipment.id,
      destinationPartyUUID: consumerId,
      destinationPartyName: consumerName,
      status: normalizeStatusValue(shipment.status),
      createdAt: shipment.created_at,
      segments,
      totalPackages: shipmentItems.length,
      totalSegments: segments.length,
    };
  });

  // Get next cursor from last item
  const nextCursor =
    hasMore && actualShipments.length > 0
      ? actualShipments[actualShipments.length - 1].created_at
      : null;

  return {
    statusCode: 200,
    body: {
      shipments: result,
      cursor: nextCursor,
      hasMore,
    },
  };
}

export async function listManufacturerShipmentProductSummary({
  manufacturerId,
  status,
}) {
  const parsed = ManufacturerShipmentsQuery.safeParse({
    manufacturerId,
    status,
  });

  if (!parsed.success) {
    const message =
      parsed.error.issues?.[0]?.message ??
      "manufacturerId must be a valid UUID";
    throw shipmentValidationError(message);
  }

  const { manufacturerId: normalizedManufacturerId, status: statusValue } =
    parsed.data;

  const rows = await summarizeManufacturerPackagesForShipments({
    manufacturerId: normalizedManufacturerId,
    status: statusValue ?? null,
  });

  const grouped = rows.reduce((acc, row) => {
    const category =
      typeof row.product_category_name === "string" &&
      row.product_category_name.trim().length > 0
        ? row.product_category_name.trim()
        : "Uncategorized";
    const product =
      typeof row.product_name === "string" && row.product_name.trim().length > 0
        ? row.product_name.trim()
        : "Unknown Product";
    const quantity =
      typeof row.total_quantity === "number"
        ? row.total_quantity
        : Number(row.total_quantity ?? 0) || 0;

    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      product,
      quantity,
    });
    return acc;
  }, {});

  return {
    statusCode: 200,
    body: grouped,
  };
}

export async function listShipments({
  manufacturerUUID,
  status,
  cursor,
  limit,
} = {}) {
  try {
    // If manufacturerUUID is provided, use the optimized manufacturer endpoint
    if (
      manufacturerUUID &&
      typeof manufacturerUUID === "string" &&
      manufacturerUUID.trim()
    ) {
      return await listManufacturerShipments({
        manufacturerId: manufacturerUUID.trim(),
        status,
        cursor,
        limit,
      });
    }

    // Otherwise, return full shipment details
    const shipments = await getAllShipmentRecords();
    const result = await Promise.all(
      shipments.map(async (shipment) => {
        const shipmentId = shipment.id ?? shipment.shipment_id;
        const shipmentSegments = await listShipmentSegmentsForShipment(
          shipmentId
        );
        const checkpoints = buildCheckpointsFromSegments(shipmentSegments);
        const canonicalCheckpoints =
          buildCanonicalCheckpointsFromSegments(shipmentSegments);
        const assignedProducts = await listPackagesByShipmentUuid(shipmentId);
        const shipmentItems =
          mapAssignedProductsToShipmentItems(assignedProducts);

        let dbHash = null;
        let blockchainHash = null;
        let integrity = "not_on_chain";

        try {
          const integrityResult = await ensureShipmentOnChainIntegrity({
            shipmentRecord: shipment,
            checkpoints: canonicalCheckpoints,
            shipmentItems,
          });
          dbHash = integrityResult.hash;
          blockchainHash = integrityResult.hash;
          integrity = "valid";
        } catch (integrityErr) {
          const details = integrityErr?.details ?? {};

          if (details.computed) {
            dbHash = normalizeHash(details.computed);
          } else {
            try {
              const prepared = prepareShipmentPersistence(
                shipmentId,
                {
                  manufacturerUUID:
                    shipment.manufacturer_uuid ?? shipment.manufacturerUUID,
                  consumerUUID:
                    shipment.consumer_uuid ??
                    shipment.destination_party_uuid ??
                    shipment.consumerUUID ??
                    shipment.destinationPartyUUID,
                  status:
                    shipment.status ??
                    shipment.shipment_status ??
                    shipment.shipmentStatus ??
                    "PENDING",
                },
                {
                  shipmentItems,
                  checkpoints: canonicalCheckpoints,
                }
              );
              dbHash = normalizeHash(prepared.payloadHash);
            } catch {
              // For list views we tolerate hash recomputation failures.
            }
          }

          if (details.onChain) {
            blockchainHash = normalizeHash(details.onChain);
            integrity = "tampered";
          } else if (integrityErr.code === ShipmentErrorCodes.HASH_MISMATCH) {
            integrity = "tampered";
          }
        }

        const formatted = formatShipmentRecord(shipment);
        const payload = normalizeShipmentResponse({
          ...formatted,
          checkpoints,
          shipmentItems,
          shipmentSegments,
          dbHash,
          blockchainHash,
          integrity,
        });

        return normalizePinataFields(payload);
      })
    );

    return {
      statusCode: 200,
      body: result,
    };
  } catch (error) {
    throw toHttpError(error);
  }
}
