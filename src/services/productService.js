import { randomUUID } from "node:crypto";
import {
  prepareProductPersistence,
  formatProductRecord,
  ensureProductOnChainIntegrity,
  deriveProductPayloadFromRecord,
} from "./productIntegrityService.js";
import {
  insertProduct,
  updateProductRecord,
  findProductById,
  listProductsByManufacturerUuid,
} from "../models/ProductRegistryModel.js";
import {
  registrationRequired,
  manufacturerMismatch,
  manufacturerForbidden,
  manufacturerImmutable,
  productNotFound,
  hashMismatch,
} from "../errors/productErrors.js";
import {
  registerProductOnChain,
  updateProductOnChain,
} from "../eth/productContract.js";
import { normalizeHash } from "../utils/hash.js";
import { encrypt } from "../utils/encryptionHelper.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

function ensureManufacturerAccess(registration, manufacturerUUID) {
  const registrationId = registration?.id;
  if (!registrationId) {
    throw registrationRequired();
  }

  if (
    manufacturerUUID &&
    registrationId.toLowerCase() !== manufacturerUUID.toLowerCase()
  ) {
    throw manufacturerForbidden();
  }
}

export async function createProduct({ payload, registration, wallet }) {
  const productId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareProductPersistence(
    productId,
    payload
  );

  ensureManufacturerAccess(registration, normalized.manufacturerUUID);

  if (
    normalized.manufacturerUUID.toLowerCase() !== registration.id.toLowerCase()
  ) {
    throw manufacturerMismatch();
  }

  const { txHash, productHash } = await registerProductOnChain(
    uuidToBytes16Hex(productId),
    canonical
  );

  const normalizedOnChain = normalizeHash(productHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during product registration",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "product",
    record: {
      id: productId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: productId,
    errorMessage: "⚠️ Failed to back up product to Pinata:",
  });

  const encryptedWifiPassword = normalized.wifiPassword
    ? encrypt(normalized.wifiPassword)
    : null;

  const record = await insertProduct({
    id: productId,
    productName: normalized.productName,
    productCategory: normalized.productCategory,
    batchId: normalized.batchId ?? null,
    shipmentId: normalized.shipmentId ?? null,
    quantity: normalized.quantity ?? null,
    microprocessorMac: normalized.microprocessorMac ?? null,
    sensorTypes: normalized.sensorTypes ?? null,
    wifiSSID: normalized.wifiSSID ?? null,
    encryptedWifiPassword,
    manufacturerUUID: normalized.manufacturerUUID,
    productHash: payloadHash,
    txHash,
    createdBy:
      wallet?.walletAddress ??
      registration?.id ??
      normalized.manufacturerUUID ??
      "unknown",
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
    status: normalized.status ?? null,
  });

  const formatted = formatProductRecord(record);

  return {
    statusCode: 201,
    body: {
      code: 201,
      message: "Product registered successfully",
      id: formatted.id,
      txHash: formatted.txHash,
    },
  };
}

export async function updateProductDetails({
  id,
  payload,
  registration,
  wallet,
}) {
  const existing = await findProductById(id);
  if (!existing) {
    throw productNotFound();
  }

  const defaults = deriveProductPayloadFromRecord(existing);
  ensureManufacturerAccess(registration, existing.manufacturer_uuid);

  const { normalized, canonical, payloadHash } = prepareProductPersistence(
    id,
    payload,
    defaults
  );

  ensureManufacturerAccess(registration, normalized.manufacturerUUID);

  if (
    normalized.manufacturerUUID.toLowerCase() !==
    existing.manufacturer_uuid.toLowerCase()
  ) {
    throw manufacturerImmutable();
  }

  const { txHash, productHash } = await updateProductOnChain(
    uuidToBytes16Hex(id),
    canonical
  );

  const normalizedOnChain = productHash
    ? normalizeHash(productHash)
    : normalizeHash(payloadHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during product update",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "product",
    record: {
      id,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "update",
    identifier: id,
    errorMessage: "⚠️ Failed to back up product update to Pinata:",
  });

  const encryptedWifiPassword = normalized.wifiPassword
    ? encrypt(normalized.wifiPassword)
    : null;

  const record = await updateProductRecord(id, {
    productName: normalized.productName,
    productCategory: normalized.productCategory,
    batchId: normalized.batchId ?? null,
    shipmentId: normalized.shipmentId ?? null,
    quantity: normalized.quantity ?? null,
    microprocessorMac: normalized.microprocessorMac ?? null,
    sensorTypes: normalized.sensorTypes ?? null,
    wifiSSID: normalized.wifiSSID ?? null,
    encryptedWifiPassword,
    manufacturerUUID: normalized.manufacturerUUID,
    productHash: payloadHash,
    txHash,
    updatedBy:
      wallet?.walletAddress ??
      registration?.id ??
      normalized.manufacturerUUID ??
      existing.manufacturer_uuid ??
      null,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : existing.pinata_pinned_at ?? null,
    status: normalized.status ?? null,
  });

  const formatted = formatProductRecord(record);

  return {
    statusCode: 200,
    body: {
      code: 200,
      message: "Product updated successfully",
      id: formatted.id,
      txHash: formatted.txHash,
      updatedAt: formatted.updatedAt,
      status: formatted.status,
    },
  };
}

export async function getProductDetails({ id, registration }) {
  const existing = await findProductById(id);
  if (!existing) {
    throw productNotFound();
  }

  ensureManufacturerAccess(registration, existing.manufacturer_uuid);
  const integrity = await ensureProductOnChainIntegrity(existing);

  return {
    statusCode: 200,
    body: {
      ...formatProductRecord(existing),
    },
  };
}

export async function listManufacturerProducts({
  manufacturerUuid,
  registration,
}) {
  ensureManufacturerAccess(registration, manufacturerUuid);

  const rows = await listProductsByManufacturerUuid(manufacturerUuid);
  await Promise.all(rows.map((row) => ensureProductOnChainIntegrity(row)));

  return {
    statusCode: 200,
    body: rows.map((row) => formatProductRecord(row)),
  };
}
