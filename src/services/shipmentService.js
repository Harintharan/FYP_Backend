import { randomUUID } from "node:crypto";
import { query } from "../db.js";
import {
  createShipment,
  updateShipment as updateShipmentRecord,
  getShipmentById,
  getAllShipments as getAllShipmentRecords,
} from "../models/ShipmentRegistryModel.js";
import {
  findProductById,
  listProductsByShipmentUuid,
  assignProductToShipment,
  clearProductsFromShipment,
} from "../models/ProductRegistryModel.js";
import {
  createShipmentSegment,
  listShipmentSegmentsForShipment,
  deleteShipmentSegmentsByShipmentId,
} from "./shipmentSegmentService.js";
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
import { ErrorCodes } from "../errors/errorCodes.js";
import {
  hashMismatch,
  shipmentNotFound,
  shipmentValidationError,
  shipmentConflictError,
  ShipmentErrorCodes,
} from "../errors/shipmentErrors.js";
import { HttpError } from "../utils/httpError.js";

const PRODUCT_STATUS_READY_FOR_SHIPMENT = "PRODUCT_READY_FOR_SHIPMENT";
const REQUIRED_CHECKPOINT_FIELDS = Object.freeze([
  "start_checkpoint_id",
  "end_checkpoint_id",
  "estimated_arrival_date",
  "time_tolerance",
  "expected_ship_date",
]);

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

  return {
    ...payload,
    consumerUUID: consumerValue,
    destinationPartyUUID: consumerValue,
  };
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
    [checkpointId],
  );
  return rows.length > 0;
}

function normalizeQuantity(rawQuantity, index) {
  if (
    rawQuantity === undefined ||
    rawQuantity === null ||
    rawQuantity === ""
  ) {
    return null;
  }

  const parsed = Number(rawQuantity);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw shipmentValidationError(
      `shipmentItems[${index}].quantity must be a non-negative number`,
    );
  }

  return Math.trunc(parsed);
}

async function normalizeShipmentItemsInput(
  shipmentItems,
  manufacturerUUID,
  currentShipmentId = null,
) {
  if (!Array.isArray(shipmentItems)) {
    return [];
  }

  const normalized = [];
  for (const [index, item] of shipmentItems.entries()) {
    const productIdRaw =
      item?.product_uuid ?? item?.productUUID ?? item?.productId ?? null;

    if (!productIdRaw || typeof productIdRaw !== "string") {
      throw shipmentValidationError(
        `shipmentItems[${index}].product_uuid is required`,
      );
    }

    const productId = productIdRaw.trim();
    const product = await findProductById(productId);
    if (!product) {
      throw shipmentValidationError(
        `shipmentItems[${index}].product_uuid does not exist`,
      );
    }

    if (
      typeof manufacturerUUID === "string" &&
      product.manufacturer_uuid &&
      product.manufacturer_uuid.toLowerCase() !==
        manufacturerUUID.toLowerCase()
    ) {
      throw shipmentValidationError(
        `shipmentItems[${index}].product_uuid belongs to a different manufacturer`,
      );
    }

    if (
      product.shipment_id &&
      (!currentShipmentId ||
        product.shipment_id.toLowerCase() !== currentShipmentId.toLowerCase())
    ) {
      throw shipmentConflictError(
        `shipmentItems[${index}].product_uuid is already assigned to another shipment`,
      );
    }

    const currentStatus = product.status ?? null;
    const isSameShipment =
      currentShipmentId &&
      product.shipment_id &&
      product.shipment_id.toLowerCase() === currentShipmentId.toLowerCase();

    if (!isSameShipment && currentStatus !== PRODUCT_STATUS_READY_FOR_SHIPMENT) {
      throw shipmentConflictError(
        `shipmentItems[${index}].product_uuid must be in status ${PRODUCT_STATUS_READY_FOR_SHIPMENT}`,
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
      product_uuid: product.id,
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

  if (!manufacturerUUID || !consumerUUID) {
    throw shipmentValidationError(
      "manufacturerUUID and consumerUUID are required",
    );
  }

  return { manufacturerUUID, consumerUUID };
}

async function validateCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    throw shipmentValidationError("At least one checkpoint is required");
  }

  for (const [index, checkpoint] of checkpoints.entries()) {
    for (const field of REQUIRED_CHECKPOINT_FIELDS) {
      if (!checkpoint[field]) {
        throw shipmentValidationError(
          `checkpoints[${index}] missing required field: ${field}`,
        );
      }
    }

    const startExists = await assertCheckpointExists(
      checkpoint.start_checkpoint_id,
    );
    if (!startExists) {
      throw shipmentValidationError(
        `checkpoints[${index}].start_checkpoint_id does not exist`,
      );
    }

    const endExists = await assertCheckpointExists(
      checkpoint.end_checkpoint_id,
    );
    if (!endExists) {
      throw shipmentValidationError(
        `checkpoints[${index}].end_checkpoint_id does not exist`,
      );
    }
  }
}

function mapAssignedProductsToShipmentItems(assignedProducts) {
  return assignedProducts.map((product) => ({
    product_uuid: product.id,
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
    const { manufacturerUUID, consumerUUID } = requireShipmentEndpoints(
      payload ?? {},
    );

    const shipmentItems = Array.isArray(payload?.shipmentItems)
      ? payload.shipmentItems
      : [];
    if (shipmentItems.length === 0) {
      throw shipmentValidationError(
        "At least one shipment item is required",
      );
    }

    const checkpoints = Array.isArray(payload?.checkpoints)
      ? payload.checkpoints
      : [];

    await validateCheckpoints(checkpoints);

    const normalizedItems = await normalizeShipmentItemsInput(
      shipmentItems,
      manufacturerUUID,
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
      { manufacturerUUID, consumerUUID },
      {
        shipmentItems: normalizedItems,
        checkpoints,
      },
    );

    const { txHash, shipmentHash } = await registerShipmentOnChain(
      uuidToBytes16Hex(shipmentId),
      payloadHash,
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
      manufacturerUUID: normalized.manufacturerUUID,
      consumerUUID: normalized.consumerUUID,
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
        },
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
          client,
        );

        for (const item of normalizedItems) {
          await assignProductToShipment(
            item.product_uuid,
            shipmentId,
            item.quantity,
            client,
          );
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
        transactionErr,
      );
      throw transactionErr;
    }

    const formattedShipment = formatShipmentRecord(persistedShipment);
    const [shipmentSegments, assignedProducts] = await Promise.all([
      listShipmentSegmentsForShipment(shipmentId),
      listProductsByShipmentUuid(shipmentId),
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
        },
      ),
    );

    responsePayload.pinataCid =
      formattedShipment.pinataCid ?? pinataBackup?.IpfsHash ?? null;
    responsePayload.pinataTimestamp =
      formattedShipment.pinataPinnedAt ??
      (pinataBackup?.Timestamp ? new Date(pinataBackup.Timestamp) : null);

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

    const formattedShipment = formatShipmentRecord(shipment);
    const shipmentSegments = await listShipmentSegmentsForShipment(id);
    const checkpoints = buildCheckpointsFromSegments(shipmentSegments);
    const canonicalCheckpoints =
      buildCanonicalCheckpointsFromSegments(shipmentSegments);
    const assignedProducts = await listProductsByShipmentUuid(id);
    const shipmentItems = mapAssignedProductsToShipmentItems(assignedProducts);

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
            id,
            {
              manufacturerUUID: formattedShipment.manufacturerUUID,
              consumerUUID: formattedShipment.consumerUUID,
            },
            {
              shipmentItems,
              checkpoints: canonicalCheckpoints,
            },
          );
          dbHash = normalizeHash(prepared.payloadHash);
        } catch (computeErr) {
          console.warn(
            "⚠️ Failed to recompute shipment hash locally:",
            computeErr.message,
          );
        }
      }

      if (details.onChain) {
        blockchainHash = normalizeHash(details.onChain);
        integrity = "tampered";
      } else if (integrityErr.code === ShipmentErrorCodes.HASH_MISMATCH) {
        integrity = "tampered";
      }
    }

    const payload = normalizeShipmentResponse({
      ...formattedShipment,
      checkpoints,
      shipmentItems,
      shipmentSegments,
      dbHash,
      blockchainHash,
      integrity,
    });

    return {
      statusCode: 200,
      body: normalizePinataFields(payload),
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

    const { manufacturerUUID, consumerUUID } = requireShipmentEndpoints(
      payload ?? {},
    );

    const shipmentItems = Array.isArray(payload?.shipmentItems)
      ? payload.shipmentItems
      : [];
    if (shipmentItems.length === 0) {
      throw shipmentValidationError(
        "At least one shipment item is required",
      );
    }

    const checkpoints = Array.isArray(payload?.checkpoints)
      ? payload.checkpoints
      : [];

    await validateCheckpoints(checkpoints);

    const normalizedItems = await normalizeShipmentItemsInput(
      shipmentItems,
      manufacturerUUID,
      id,
    );

    if (
      existing.manufacturer_uuid &&
      existing.manufacturer_uuid.toLowerCase() !==
        manufacturerUUID.toLowerCase()
    ) {
      throw shipmentValidationError(
        "manufacturerUUID cannot be changed for an existing shipment",
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
      { manufacturerUUID, consumerUUID },
      { shipmentItems: normalizedItems, checkpoints },
    );

    const { txHash, shipmentHash } = await updateShipmentOnChain(
      uuidToBytes16Hex(id),
      payloadHash,
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
        },
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up shipment update to Pinata:",
        backupErr,
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
            shipment_hash: payloadHash,
            tx_hash: txHash,
            updated_by: normalizeRegistrationWallet(wallet),
            pinata_cid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
            pinata_pinned_at: pinataBackup?.Timestamp
              ? new Date(pinataBackup.Timestamp)
              : existing.pinata_pinned_at ?? null,
          },
          client,
        );

        await clearProductsFromShipment(id, client);

        for (const item of normalizedItems) {
          await assignProductToShipment(
            item.product_uuid,
            id,
            item.quantity,
            client,
          );
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
        transactionErr,
      );
      throw transactionErr;
    }

    const formattedShipment = formatShipmentRecord(updatedShipment);
    const [shipmentSegments, assignedProducts] = await Promise.all([
      listShipmentSegmentsForShipment(id),
      listProductsByShipmentUuid(id),
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
        },
      ),
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

export async function listShipments() {
  try {
    const shipments = await getAllShipmentRecords();
    const result = await Promise.all(
      shipments.map(async (shipment) => {
        const shipmentId = shipment.id ?? shipment.shipment_id;
        const shipmentSegments = await listShipmentSegmentsForShipment(
          shipmentId,
        );
        const checkpoints = buildCheckpointsFromSegments(shipmentSegments);
        const canonicalCheckpoints =
          buildCanonicalCheckpointsFromSegments(shipmentSegments);
        const assignedProducts = await listProductsByShipmentUuid(
          shipmentId,
        );
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
                },
                {
                  shipmentItems,
                  checkpoints: canonicalCheckpoints,
                },
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
      }),
    );

    return {
      statusCode: 200,
      body: result,
    };
  } catch (error) {
    throw toHttpError(error);
  }
}
