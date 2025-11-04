import { randomUUID } from "node:crypto";
import { BatchPayload } from "../domain/batch.schema.js";
import {
  prepareBatchPersistence,
  ensureBatchOnChainIntegrity,
  deriveBatchPayloadFromRecord,
} from "./batchIntegrityService.js";
import {
  registerBatchOnChain,
  updateBatchOnChain,
} from "../eth/batchContract.js";
import {
  insertBatch,
  updateBatch as updateBatchRecord,
  findBatchById,
  listBatchesByManufacturerUuid,
} from "../models/batchModel.js";
import { findProductById } from "../models/ProductModel.js";
import { normalizeHash } from "../utils/hash.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import * as batchErrors from "../errors/batchErrors.js";
import { productNotFound } from "../errors/productErrors.js";

function sanitizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const trimmed =
    typeof value === "string" ? value.trim() : String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function sanitizeOptionalTimestamp(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed =
    typeof value === "string" ? value.trim() : String(value).trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBatchRecord(record) {
  const productionStart = record.production_start_time ?? null;
  const productionEnd = record.production_end_time ?? null;

  return {
    id: record.id,
    product: {
      id: record.product_id ?? null,
      name: record.product_name ?? null,
    },
    manufacturerUUID: record.manufacturer_uuid ?? null,
    facility: record.facility ?? null,
    productionStartTime:
      productionStart instanceof Date
        ? productionStart.toISOString()
        : sanitizeOptionalString(productionStart),
    productionEndTime:
      productionEnd instanceof Date
        ? productionEnd.toISOString()
        : sanitizeOptionalString(productionEnd),
    quantityProduced: record.quantity_produced ?? null,
    expiryDate: sanitizeOptionalString(record.expiry_date),
    payloadHash: normalizeHash(record.batch_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt:
      record.created_at instanceof Date
        ? record.created_at.toISOString()
        : record.created_at ?? null,
    updatedAt:
      record.updated_at instanceof Date
        ? record.updated_at.toISOString()
        : record.updated_at ?? null,
  };
}

function forbidOtherManufacturer(registration, manufacturerUUID) {
  const registrationId = registration?.id;
  if (
    registrationId &&
    registrationId.toLowerCase() !== manufacturerUUID.toLowerCase()
  ) {
    throw batchErrors.manufacturerForbidden();
  }
}

export async function createBatch({ payload, registration, wallet }) {
  const parsed = BatchPayload.parse(payload);

  if (!registration?.id) {
    throw batchErrors.registrationRequired();
  }

  const manufacturerUuid = registration.id.trim().toLowerCase();

  if (manufacturerUuid !== parsed.manufacturerUUID.toLowerCase()) {
    throw batchErrors.manufacturerMismatch();
  }

  const product = await findProductById(parsed.productId);
  if (!product) {
    throw productNotFound();
  }

  if (
    product.manufacturer_uuid &&
    product.manufacturer_uuid.toLowerCase() !== manufacturerUuid
  ) {
    throw batchErrors.manufacturerForbidden();
  }

  const batchId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareBatchPersistence(
    batchId,
    parsed
  );

  const { txHash, batchHash } = await registerBatchOnChain(
    uuidToBytes16Hex(batchId),
    canonical
  );

  const normalizedOnChain = normalizeHash(batchHash);
  const normalizedComputed = normalizeHash(payloadHash);

  if (normalizedOnChain !== normalizedComputed) {
    console.error("Batch hash mismatch detected during register", {
      normalizedOnChain,
      normalizedComputed,
    });
    throw batchErrors.hashMismatch({
      normalizedOnChain,
      normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "batch",
    record: {
      id: batchId,
      ...normalized,
      payloadCanonical: canonical,
      payloadHash,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: batchId,
    errorMessage: "⚠️ Failed to back up batch to Pinata:",
  });

  const record = await insertBatch({
    id: batchId,
    manufacturerUUID: normalized.manufacturerUUID,
    facility: normalized.facility,
    productId: normalized.productId,
    productionStartTime: sanitizeOptionalTimestamp(
      normalized.productionStartTime
    ),
    productionEndTime: sanitizeOptionalTimestamp(normalized.productionEndTime),
    quantityProduced: normalized.quantityProduced,
    expiryDate: sanitizeOptionalString(normalized.expiryDate),
    batchHash: payloadHash,
    txHash,
    createdBy: wallet?.walletAddress ?? manufacturerUuid,
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
  });

  return {
    statusCode: 201,
    body: {
      code: 201,
      message: "Batch registered successfully",
      batchId: record.id,
      txHash,
    },
  };
}

export async function updateBatchDetails({
  id,
  payload,
  registration,
  wallet,
}) {
  const existing = await findBatchById(id);
  if (!existing) {
    throw batchErrors.batchNotFound();
  }

  forbidOtherManufacturer(registration, existing.manufacturer_uuid);

  const parsed = BatchPayload.parse(payload);
  if (
    existing.manufacturer_uuid.toLowerCase() !==
    parsed.manufacturerUUID.toLowerCase()
  ) {
    throw batchErrors.manufacturerImmutable();
  }

  if (
    !existing.product_id ||
    existing.product_id.toLowerCase() !== parsed.productId.toLowerCase()
  ) {
    const product = await findProductById(parsed.productId);
    if (!product) {
      throw productNotFound();
    }
    if (
      product.manufacturer_uuid &&
      product.manufacturer_uuid.toLowerCase() !==
        registration.id.toLowerCase()
    ) {
      throw batchErrors.manufacturerForbidden();
    }
  }

  const defaults = deriveBatchPayloadFromRecord(existing);
  const { normalized, canonical, payloadHash } = prepareBatchPersistence(
    id,
    parsed,
    defaults
  );

  const { txHash, batchHash } = await updateBatchOnChain(
    uuidToBytes16Hex(id),
    canonical
  );

  const onChainHash =
    batchHash != null ? normalizeHash(batchHash) : normalizeHash(payloadHash);
  const computedHash = normalizeHash(payloadHash);

  if (onChainHash !== computedHash) {
    console.error("Batch hash mismatch detected during update", {
      onChainHash,
      computedHash,
    });
    throw batchErrors.hashMismatch({
      onChainHash,
      computedHash,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "batch",
    record: {
      id,
      ...normalized,
      payloadCanonical: canonical,
      payloadHash,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "update",
    identifier: id,
    errorMessage: "⚠️ Failed to back up batch update to Pinata:",
  });

  const record = await updateBatchRecord({
    id,
    productId: normalized.productId,
    manufacturerUUID: normalized.manufacturerUUID,
    facility: normalized.facility,
    productionStartTime: sanitizeOptionalTimestamp(
      normalized.productionStartTime
    ),
    productionEndTime: sanitizeOptionalTimestamp(
      normalized.productionEndTime
    ),
    quantityProduced: normalized.quantityProduced,
    expiryDate: sanitizeOptionalString(normalized.expiryDate),
    batchHash: payloadHash,
    txHash,
    updatedBy: wallet?.walletAddress ?? null,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt:
      pinataBackup?.Timestamp
        ? new Date(pinataBackup.Timestamp)
        : existing.pinata_pinned_at ?? null,
  });

  const formatted = formatBatchRecord(record);

  return {
    statusCode: 200,
    body: {
      code: 200,
      message: "Batch updated successfully",
      batchId: formatted.id,
      txHash,
      updatedAt: formatted.updatedAt,
    },
  };
}

export async function getBatchDetails({ id, registration }) {
  const record = await findBatchById(id);
  if (!record) {
    const error = new Error("Batch not found");
    error.statusCode = 404;
    throw error;
  }

  forbidOtherManufacturer(registration, record.manufacturer_uuid);
  await ensureBatchOnChainIntegrity(record);

  return {
    statusCode: 200,
    body: formatBatchRecord(record),
  };
}

export async function listManufacturerBatches({
  manufacturerUuid,
  registration,
}) {
  forbidOtherManufacturer(registration, manufacturerUuid);

  const rows = await listBatchesByManufacturerUuid(manufacturerUuid);
  await Promise.all(rows.map((row) => ensureBatchOnChainIntegrity(row)));

  const sanitized = rows.map((row) => formatBatchRecord(row));

  return {
    statusCode: 200,
    body: sanitized,
  };
}

export { formatBatchRecord };
