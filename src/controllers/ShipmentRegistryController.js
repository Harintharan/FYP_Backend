import { randomUUID } from "node:crypto";
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
} from "../services/shipmentSegmentService.js";
import { query } from "../db.js";
import { backupRecord } from "../services/pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import {
  prepareShipmentPersistence,
  ensureShipmentOnChainIntegrity,
  formatShipmentRecord,
} from "../services/shipmentIntegrityService.js";
import {
  registerShipmentOnChain,
  updateShipmentOnChain,
  shipmentOperatorAddress,
} from "../eth/shipmentContract.js";
import { normalizeHash } from "../utils/hash.js";
import { runInTransaction } from "../utils/dbTransactions.js";
import { hashMismatch, ShipmentErrorCodes } from "../errors/shipmentErrors.js";
const PRODUCT_STATUS_READY_FOR_SHIPMENT = "PRODUCT_READY_FOR_SHIPMENT";
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
    [checkpointId]
  );
  return rows.length > 0;
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
    const productIdRaw =
      item?.product_uuid ?? item?.productUUID ?? item?.productId ?? null;
    if (!productIdRaw || typeof productIdRaw !== "string") {
      const err = new Error(
        `shipmentItems[${index}].product_uuid is required`
      );
      err.status = 400;
      throw err;
    }
    const productId = productIdRaw.trim();
    const product = await findProductById(productId);
    if (!product) {
      const err = new Error(
        `shipmentItems[${index}].product_uuid does not exist`
      );
      err.status = 400;
      throw err;
    }
    if (
      typeof manufacturerUUID === "string" &&
      product.manufacturer_uuid &&
      product.manufacturer_uuid.toLowerCase() !== manufacturerUUID.toLowerCase()
    ) {
      const err = new Error(
        `shipmentItems[${index}].product_uuid belongs to a different manufacturer`
      );
      err.status = 400;
      throw err;
    }
    if (
      product.shipment_id &&
      (!currentShipmentId ||
        product.shipment_id.toLowerCase() !== currentShipmentId.toLowerCase())
    ) {
      const err = new Error(
        `shipmentItems[${index}].product_uuid is already assigned to another shipment`
      );
      err.status = 409;
      throw err;
    }
    const currentStatus = product.status ?? null;
    const isSameShipment =
      currentShipmentId &&
      product.shipment_id &&
      product.shipment_id.toLowerCase() === currentShipmentId.toLowerCase();
    if (!isSameShipment) {
      if (currentStatus !== PRODUCT_STATUS_READY_FOR_SHIPMENT) {
        const err = new Error(
          `shipmentItems[${index}].product_uuid must be in status ${PRODUCT_STATUS_READY_FOR_SHIPMENT}`
        );
        err.status = 409;
        throw err;
      }
    }
    let quantityValue = null;
    if (Object.prototype.hasOwnProperty.call(item ?? {}, "quantity")) {
      const rawQuantity = item?.quantity;
      if (rawQuantity === "" || rawQuantity === undefined || rawQuantity === null) {
        quantityValue = null;
      } else {
        const parsed = Number(rawQuantity);
        if (!Number.isFinite(parsed) || parsed < 0) {
          const err = new Error(
            `shipmentItems[${index}].quantity must be a non-negative number`
          );
          err.status = 400;
          throw err;
        }
        quantityValue = Math.trunc(parsed);
      }
    }
    if (quantityValue === null && product.quantity !== undefined && product.quantity !== null) {
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
export async function registerShipment(req, res) {
  try {
    const manufacturerUUID =
      req.body.manufacturerUUID ?? req.body.manufacturer_uuid ?? null;
    const consumerUUID =
      req.body.consumerUUID ??
      req.body.consumer_uuid ??
      req.body.destinationPartyUUID ??
      req.body.destination_party_uuid ??
      null;
    const shipmentItems = Array.isArray(req.body.shipmentItems)
      ? req.body.shipmentItems
      : [];
    const checkpoints = Array.isArray(req.body.checkpoints)
      ? req.body.checkpoints
      : [];
    if (!manufacturerUUID || !consumerUUID) {
      return res.status(400).json({
        message: "manufacturerUUID and consumerUUID are required",
      });
    }
    if (shipmentItems.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one shipment item is required" });
    }
    let normalizedItems;
    try {
      normalizedItems = await normalizeShipmentItemsInput(
        shipmentItems,
        manufacturerUUID
      );
    } catch (itemErr) {
      return res
        .status(itemErr.status ?? 400)
        .json({ message: itemErr.message });
    }
    if (checkpoints.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one checkpoint is required" });
    }
    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
    ];
    for (const [index, checkpoint] of checkpoints.entries()) {
      for (const field of requiredFields) {
        if (!checkpoint[field]) {
          return res.status(400).json({
            message: `checkpoints[${index}] missing required field: ${field}`,
          });
        }
      }
    }
    for (const [index, checkpoint] of checkpoints.entries()) {
      const segmentOrder =
        typeof checkpoint.segment_order === "number"
          ? checkpoint.segment_order
          : typeof checkpoint.segmentOrder === "number"
            ? checkpoint.segmentOrder
            : index + 1;
      const startExists = await assertCheckpointExists(
        checkpoint.start_checkpoint_id
      );
      const endExists = await assertCheckpointExists(
        checkpoint.end_checkpoint_id
      );
      if (!startExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].start_checkpoint_id does not exist`,
        });
      }
      if (!endExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].end_checkpoint_id does not exist`,
        });
      }
    }
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
      manufacturerUUID: normalized.manufacturerUUID,
      consumerUUID: normalized.consumerUUID,
      shipment_hash: payloadHash,
      tx_hash: txHash,
      created_by:
        req.wallet?.walletAddress ?? shipmentOperatorAddress ?? null,
    };
    let pinataBackup;
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
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up shipment to Pinata:",
        backupErr
      );
    }
    let savedShipment;
    try {
      savedShipment = await runInTransaction(async (client) => {
        const persisted = await createShipment(
          {
            ...createPayload,
            pinata_cid: pinataBackup?.IpfsHash ?? null,
            pinata_pinned_at: pinataBackup?.Timestamp ?? null,
          },
          client
        );

        for (const item of normalizedItems) {
          await assignProductToShipment(
            item.product_uuid,
            shipmentId,
            item.quantity,
            client
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
            walletAddress: req.wallet?.walletAddress ?? null,
            dbClient: client,
          });
        }

        return persisted;
      });
    } catch (transactionErr) {
      console.error(
        "❌ Failed to persist shipment within transaction:",
        transactionErr
      );
      throw transactionErr;
    }

    const formattedShipment = formatShipmentRecord(savedShipment);
    const [shipmentSegments, assignedProducts] = await Promise.all([
      listShipmentSegmentsForShipment(shipmentId),
      listProductsByShipmentUuid(shipmentId),
    ]);
    const savedCheckpoints = buildCheckpointsFromSegments(shipmentSegments);
    const shipmentItemsPayload = assignedProducts.map((product) => ({
      product_uuid: product.id,
      quantity:
        product.quantity !== undefined && product.quantity !== null
          ? Number(product.quantity)
          : null,
    }));
    const responsePayload = normalizeShipmentResponse({
      ...formattedShipment,
      handover_checkpoints: savedCheckpoints,
      shipmentItems: shipmentItemsPayload,
      shipmentSegments,
      blockchainTx: txHash,
      dbHash: payloadHash,
      blockchainHash: normalizedOnChain,
    });
    responsePayload.pinataCid = formattedShipment.pinataCid ?? null;
    responsePayload.pinataTimestamp = formattedShipment.pinataPinnedAt ?? null;
    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("❌ Error registering shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
export async function getShipment(req, res) {
  try {
    const shipmentId = req.params.id ?? req.params.shipment_id ?? null;
    if (!shipmentId) {
      return res.status(400).json({ message: "Shipment id is required" });
    }
    const shipment = await getShipmentById(shipmentId);
    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }
    const formattedShipment = formatShipmentRecord(shipment);
    const shipmentSegments = await listShipmentSegmentsForShipment(
      shipmentId
    );
    const checkpoints = buildCheckpointsFromSegments(shipmentSegments);
    const canonicalCheckpoints =
      buildCanonicalCheckpointsFromSegments(shipmentSegments);
    const assignedProducts = await listProductsByShipmentUuid(shipmentId);
    const shipmentItems = assignedProducts.map((product) => ({
      product_uuid: product.id,
      quantity:
        product.quantity !== undefined && product.quantity !== null
          ? Number(product.quantity)
          : null,
    }));
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
              manufacturerUUID: formattedShipment.manufacturerUUID,
              consumerUUID: formattedShipment.consumerUUID,
            },
            {
              shipmentItems,
              checkpoints: canonicalCheckpoints,
            }
          );
          dbHash = normalizeHash(prepared.payloadHash);
        } catch (computeErr) {
          console.warn(
            "⚠️ Failed to recompute shipment hash locally:",
            computeErr.message
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
    res.json(
      normalizeShipmentResponse({
        ...formattedShipment,
        checkpoints,
        shipmentItems,
        shipmentSegments,
        dbHash,
        blockchainHash,
        integrity,
      })
    );
  } catch (err) {
    console.error("❌ Error fetching shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
export async function updateShipment(req, res) {
  try {
    const shipmentId = req.params.id ?? req.params.shipment_id ?? null;
    if (!shipmentId) {
      return res.status(400).json({ message: "Shipment id is required" });
    }
    const existing = await getShipmentById(shipmentId);
    if (!existing) {
      return res
        .status(404)
        .json({ message: `Shipment ${shipmentId} not found` });
    }
    const manufacturerUUID =
      req.body.manufacturerUUID ?? req.body.manufacturer_uuid ?? null;
    const consumerUUID =
      req.body.consumerUUID ??
      req.body.consumer_uuid ??
      req.body.destinationPartyUUID ??
      req.body.destination_party_uuid ??
      null;
    const shipmentItems = Array.isArray(req.body.shipmentItems)
      ? req.body.shipmentItems
      : [];
    const checkpoints = Array.isArray(req.body.checkpoints)
      ? req.body.checkpoints
      : [];
    if (!manufacturerUUID || !consumerUUID) {
      return res.status(400).json({
        message: "manufacturerUUID and consumerUUID are required",
      });
    }
    if (shipmentItems.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one shipment item is required" });
    }
    let normalizedItems;
    try {
      normalizedItems = await normalizeShipmentItemsInput(
        shipmentItems,
        manufacturerUUID,
        shipmentId
      );
    } catch (itemErr) {
      return res
        .status(itemErr.status ?? 400)
        .json({ message: itemErr.message });
    }
    if (checkpoints.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one checkpoint is required" });
    }
    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
    ];
    for (const [index, checkpoint] of checkpoints.entries()) {
      for (const field of requiredFields) {
        if (!checkpoint[field]) {
          return res.status(400).json({
            message: `checkpoints[${index}] missing required field: ${field}`,
          });
        }
      }
    }
    for (const [index, checkpoint] of checkpoints.entries()) {
      const startExists = await assertCheckpointExists(
        checkpoint.start_checkpoint_id
      );
      const endExists = await assertCheckpointExists(
        checkpoint.end_checkpoint_id
      );
      if (!startExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].start_checkpoint_id does not exist`,
        });
      }
      if (!endExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].end_checkpoint_id does not exist`,
        });
      }
    }
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
      throw hashMismatch({
        reason: "On-chain shipment hash mismatch detected during update",
        onChain: normalizedOnChain,
        computed: normalizedComputed,
      });
    }
    const updatePayload = {
      manufacturerUUID: normalized.manufacturerUUID,
      consumerUUID: normalized.consumerUUID,
      shipment_hash: payloadHash,
      tx_hash: txHash,
      updated_by:
        req.wallet?.walletAddress ??
        shipmentOperatorAddress ??
        existing.updated_by ??
        null,
    };
    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "shipment",
        {
          shipment_id: shipmentId,
          ...updatePayload,
          payloadCanonical: canonical,
          payloadHash,
          payload: {
            ...normalized,
            shipmentItems: canonicalItems,
            checkpoints: normalizedCheckpoints,
          },
        },
        {
          operation: "update",
          identifier: shipmentId,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up shipment update to Pinata:",
        backupErr
      );
    }
    updatePayload.pinata_cid =
      pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null;
    updatePayload.pinata_pinned_at =
      pinataBackup?.Timestamp ?? existing.pinata_pinned_at ?? null;
    let updatedShipment;
    try {
      updatedShipment = await runInTransaction(async (client) => {
        const persisted = await updateShipmentRecord(
          shipmentId,
          updatePayload,
          client
        );

        const keepProductIds = normalizedItems.map(
          (item) => item.product_uuid
        );
        await clearProductsFromShipment(
          shipmentId,
          keepProductIds,
          client
        );

        for (const item of normalizedItems) {
          await assignProductToShipment(
            item.product_uuid,
            shipmentId,
            item.quantity,
            client
          );
        }

        await deleteShipmentSegmentsByShipmentId(shipmentId, client);

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
            walletAddress: req.wallet?.walletAddress ?? null,
            dbClient: client,
          });
        }

        return persisted;
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
      listShipmentSegmentsForShipment(shipmentId),
      listProductsByShipmentUuid(shipmentId),
    ]);
    const savedCheckpoints = buildCheckpointsFromSegments(shipmentSegments);
    const shipmentItemsPayload = assignedProducts.map((product) => ({
      product_uuid: product.id,
      quantity:
        product.quantity !== undefined && product.quantity !== null
          ? Number(product.quantity)
          : null,
    }));
    const responsePayload = normalizeShipmentResponse({
      ...formattedShipment,
      handover_checkpoints: savedCheckpoints,
      shipmentItems: shipmentItemsPayload,
      shipmentSegments,
      blockchainTx: txHash,
      dbHash: payloadHash,
      blockchainHash: normalizedOnChain,
    });
    responsePayload.pinataCid = formattedShipment.pinataCid ?? null;
    responsePayload.pinataTimestamp = formattedShipment.pinataPinnedAt ?? null;
    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("❌ Error updating shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
export async function getAllShipments(_req, res) {
  try {
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
        const assignedProducts = await listProductsByShipmentUuid(shipmentId);
        const shipmentItems = assignedProducts.map((product) => ({
          product_uuid: product.id,
          quantity:
            product.quantity !== undefined && product.quantity !== null
              ? Number(product.quantity)
              : null,
        }));
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
              }
            );
              dbHash = normalizeHash(prepared.payloadHash);
            } catch {
              // swallow recomputation errors for list view
            }
          }
          if (details.onChain) {
            blockchainHash = normalizeHash(details.onChain);
            integrity = "tampered";
          } else if (integrityErr.code === ShipmentErrorCodes.HASH_MISMATCH) {
            integrity = "tampered";
          }
        }
        const formattedShipment = formatShipmentRecord(shipment);
        return normalizeShipmentResponse({
          ...formattedShipment,
          checkpoints,
          shipmentItems,
          shipmentSegments,
          dbHash,
          blockchainHash,
          integrity,
        });
      })
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching all shipments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
