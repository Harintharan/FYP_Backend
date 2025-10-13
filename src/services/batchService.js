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
import { normalizeHash } from "./registrationIntegrityService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { backupRecord } from "./pinataBackupService.js";
import * as batchErrors from "../errors/batchErrors.js";

function sanitizeOptional(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
}

function formatBatchRecord(record) {
  return {
    id: record.id,
    productCategory: record.product_category,
    manufacturerUUID: record.manufacturer_uuid,
    facility: record.facility,
    productionWindow: record.production_window,
    quantityProduced: record.quantity_produced,
    releaseStatus: record.release_status,
    expiryDate: sanitizeOptional(record.expiry_date),
    handlingInstructions: sanitizeOptional(record.handling_instructions),
    requiredStartTemp: sanitizeOptional(record.required_start_temp),
    requiredEndTemp: sanitizeOptional(record.required_end_temp),
    payloadHash: normalizeHash(record.batch_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
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

  if (registration.id.toLowerCase() !== parsed.manufacturerUUID.toLowerCase()) {
    throw batchErrors.manufacturerMismatch();
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

  let pinataBackup;
  try {
    pinataBackup = await backupRecord(
      "batch",
      {
        id: batchId,
        ...normalized,
        payloadCanonical: canonical,
        payloadHash,
        txHash,
        walletAddress: wallet?.walletAddress ?? null,
      },
      {
        operation: "create",
        identifier: batchId,
      }
    );
  } catch (backupErr) {
    console.error("?? Failed to back up batch to Pinata:", backupErr);
  }

  const record = await insertBatch({
    id: batchId,
    productCategory: normalized.productCategory,
    manufacturerUUID: normalized.manufacturerUUID,
    facility: normalized.facility,
    productionWindow: normalized.productionWindow,
    quantityProduced: normalized.quantityProduced,
    releaseStatus: normalized.releaseStatus,
    expiryDate: sanitizeOptional(normalized.expiryDate),
    handlingInstructions: sanitizeOptional(normalized.handlingInstructions),
    requiredStartTemp: sanitizeOptional(normalized.requiredStartTemp),
    requiredEndTemp: sanitizeOptional(normalized.requiredEndTemp),
    batchHash: payloadHash,
    txHash,
    createdBy: wallet?.walletAddress ?? null,
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp ?? null,
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

  let pinataBackup;
  try {
    pinataBackup = await backupRecord(
      "batch",
      {
        id,
        ...normalized,
        payloadCanonical: canonical,
        payloadHash,
        txHash,
        walletAddress: wallet?.walletAddress ?? null,
      },
      {
        operation: "update",
        identifier: id,
      }
    );
  } catch (backupErr) {
    console.error("?? Failed to back up batch update to Pinata:", backupErr);
  }

  const record = await updateBatchRecord({
    id,
    productCategory: normalized.productCategory,
    manufacturerUUID: normalized.manufacturerUUID,
    facility: normalized.facility,
    productionWindow: normalized.productionWindow,
    quantityProduced: normalized.quantityProduced,
    releaseStatus: normalized.releaseStatus,
    expiryDate: sanitizeOptional(normalized.expiryDate),
    handlingInstructions: sanitizeOptional(normalized.handlingInstructions),
    requiredStartTemp: sanitizeOptional(normalized.requiredStartTemp),
    requiredEndTemp: sanitizeOptional(normalized.requiredEndTemp),
    batchHash: payloadHash,
    txHash,
    updatedBy: wallet?.walletAddress ?? null,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt:
      pinataBackup?.Timestamp ?? existing.pinata_pinned_at ?? null,
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
