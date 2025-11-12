import { randomUUID } from "node:crypto";
import {
  preparePackagePersistence,
  formatPackageRecord,
  ensurePackageOnChainIntegrity,
  derivePackagePayloadFromRecord,
} from "./packageIntegrityService.js";
import {
  insertPackage,
  updatePackageRecord,
  findPackageById,
  listPackagesByManufacturerUuid,
  deletePackageById,
} from "../models/PackageRegistryModel.js";
import {
  registrationRequired,
  manufacturerMismatch,
  manufacturerForbidden,
  manufacturerImmutable,
  packageNotFound,
  hashMismatch,
} from "../errors/packageErrors.js";
import {
  registerProductOnChain,
  updateProductOnChain,
} from "../eth/packageContract.js";
import { normalizeHash } from "../utils/hash.js";
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

async function applyPackageUpdate({
  existing,
  payload,
  overrides = {},
  registration,
  wallet,
  dbClient,
  enforceAccess = true,
  pinataErrorMessage = "?? Failed to back up package update to Pinata:",
  hashMismatchReason = "On-chain hash mismatch detected during package update",
}) {
  if (!existing) {
    throw packageNotFound();
  }

  const id =
    existing.id ??
    existing.product_uuid ??
    existing.productUUID ??
    null;
  if (!id) {
    throw packageNotFound();
  }

  if (enforceAccess) {
    ensureManufacturerAccess(registration, existing.manufacturer_uuid);
  }

  const defaults = derivePackagePayloadFromRecord(existing);
  const { normalized, canonical, payloadHash } = preparePackagePersistence(
    id,
    payload ?? {},
    defaults,
    overrides,
  );

  if (enforceAccess) {
    ensureManufacturerAccess(registration, normalized.manufacturerUUID);
  }

  const existingManufacturer = existing.manufacturer_uuid ?? null;
  const normalizedManufacturer = normalized.manufacturerUUID ?? null;
  if (
    existingManufacturer &&
    normalizedManufacturer &&
    existingManufacturer.toLowerCase() !== normalizedManufacturer.toLowerCase()
  ) {
    throw manufacturerImmutable();
  }

  const { txHash, productHash } = await updateProductOnChain(
    uuidToBytes16Hex(id),
    canonical,
  );

  const normalizedOnChain = productHash
    ? normalizeHash(productHash)
    : normalizeHash(payloadHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: hashMismatchReason,
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "package",
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
    errorMessage: pinataErrorMessage,
  });

  const record = await updatePackageRecord(
    id,
    {
      batchId: normalized.batchId ?? null,
      shipmentId: normalized.shipmentId ?? null,
      quantity: normalized.quantity ?? null,
      microprocessorMac: normalized.microprocessorMac ?? null,
      sensorTypes: normalized.sensorTypes ?? null,
      manufacturerUUID: normalized.manufacturerUUID,
      productHash: payloadHash,
      txHash,
      updatedBy:
        wallet?.walletAddress ??
        registration?.id ??
        normalized.manufacturerUUID ??
        existingManufacturer ??
        existing.updated_by ??
        existing.created_by ??
        null,
      pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
      pinataPinnedAt: pinataBackup?.Timestamp
        ? new Date(pinataBackup.Timestamp)
        : existing.pinata_pinned_at ?? null,
      status: normalized.status ?? null,
    },
    dbClient,
  );

  return {
    record,
    normalized,
    canonical,
    payloadHash,
    txHash,
    pinataBackup,
    normalizedHash: normalizedComputed,
  };
}

export async function createPackage({ payload, registration, wallet }) {
  const packageId = randomUUID();
  const sanitizedPayload =
    payload && typeof payload === "object" ? { ...payload } : {};
  if ("status" in sanitizedPayload) {
    delete sanitizedPayload.status;
  }
  if ("quantity" in sanitizedPayload) {
    delete sanitizedPayload.quantity;
  }
  const defaultStatus = "PACKAGE_READY_FOR_SHIPMENT";
  const defaultQuantity = 50;
  const { normalized, canonical, payloadHash } = preparePackagePersistence(
    packageId,
    sanitizedPayload,
    {},
    { status: defaultStatus, quantity: defaultQuantity }
  );

  ensureManufacturerAccess(registration, normalized.manufacturerUUID);

  if (
    normalized.manufacturerUUID.toLowerCase() !== registration.id.toLowerCase()
  ) {
    throw manufacturerMismatch();
  }

  const { txHash, productHash } = await registerProductOnChain(
    uuidToBytes16Hex(packageId),
    canonical
  );

  const normalizedOnChain = normalizeHash(productHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during package registration",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "package",
    record: {
      id: packageId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: packageId,
    errorMessage: "⚠️ Failed to back up package to Pinata:",
  });

  const record = await insertPackage({
    id: packageId,
    batchId: normalized.batchId ?? null,
    shipmentId: normalized.shipmentId ?? null,
    quantity: normalized.quantity ?? null,
    microprocessorMac: normalized.microprocessorMac ?? null,
    sensorTypes: normalized.sensorTypes ?? null,
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
    status: normalized.status ?? defaultStatus,
  });

  const formatted = formatPackageRecord(record);

  return {
    statusCode: 201,
    body: {
      code: 201,
      message: "Package registered successfully",
      id: formatted.id,
      txHash: formatted.txHash,
    },
  };
}

export async function updatePackageDetails({
  id,
  payload,
  registration,
  wallet,
}) {
  const existing = await findPackageById(id);
  if (!existing) {
    throw packageNotFound();
  }

  const { record } = await applyPackageUpdate({
    existing,
    payload,
    registration,
    wallet,
    enforceAccess: true,
    hashMismatchReason:
      "On-chain hash mismatch detected during package update",
    pinataErrorMessage: "⚠️ Failed to back up package update to Pinata:",
  });

  const formatted = formatPackageRecord(record);

  return {
    statusCode: 200,
    body: {
      code: 200,
      message: "Package updated successfully",
      id: formatted.id,
      txHash: formatted.txHash,
      updatedAt: formatted.updatedAt,
      status: formatted.status,
    },
  };
}

export async function getPackageDetails({ id, registration }) {
  const existing = await findPackageById(id);
  if (!existing) {
    throw packageNotFound();
  }

  ensureManufacturerAccess(registration, existing.manufacturer_uuid);
  await ensurePackageOnChainIntegrity(existing);

  return {
    statusCode: 200,
    body: {
      ...formatPackageRecord(existing),
    },
  };
}

export async function listManufacturerPackages({
  manufacturerUuid,
  registration,
}) {
  ensureManufacturerAccess(registration, manufacturerUuid);

  const rows = await listPackagesByManufacturerUuid(manufacturerUuid);
  await Promise.all(rows.map((row) => ensurePackageOnChainIntegrity(row)));

  return {
    statusCode: 200,
    body: rows.map((row) => formatPackageRecord(row)),
  };
}

export async function deletePackageRecord({ id, registration }) {
  const existing = await findPackageById(id);
  if (!existing) {
    throw packageNotFound();
  }

  ensureManufacturerAccess(registration, existing.manufacturer_uuid);

  const deleted = await deletePackageById(id);
  if (!deleted) {
    throw packageNotFound();
  }

  return {
    statusCode: 204,
    body: null,
  };
}

export async function syncPackageShipmentState({
  packageId,
  shipmentId,
  quantity,
  wallet,
  dbClient,
  onMissingPackage,
}) {
  if (!packageId) {
    return null;
  }

  const existing = await findPackageById(packageId, dbClient);
  if (!existing) {
    const errorFactory =
      typeof onMissingPackage === "function" ? onMissingPackage : null;
    if (errorFactory) {
      throw errorFactory(packageId);
    }
    throw packageNotFound();
  }

  const overrides = {
    status: shipmentId
      ? "PACKAGE_ALLOCATED"
      : "PACKAGE_READY_FOR_SHIPMENT",
    shipmentId: shipmentId ?? null,
  };

  if (
    typeof quantity === "number" &&
    Number.isFinite(quantity)
  ) {
    overrides.quantity = Math.trunc(quantity);
  }

  const { txHash, normalizedHash, pinataBackup } =
    await applyPackageUpdate({
      existing,
      payload: {},
      overrides,
      wallet,
      dbClient,
      enforceAccess: false,
      hashMismatchReason: shipmentId
        ? "On-chain hash mismatch detected while assigning package to shipment"
        : "On-chain hash mismatch detected while clearing shipment from package",
      pinataErrorMessage:
        "?? Failed to back up package update to Pinata:",
    });

  return {
    txHash,
    hash: normalizedHash,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
  };
}

export async function updatePackageStatusForShipment({
  packageId,
  status,
  wallet,
  dbClient,
}) {
  if (!packageId) {
    return null;
  }

  const statusValue =
    typeof status === "string" && status.trim().length > 0
      ? status.trim().toUpperCase()
      : null;
  if (!statusValue) {
    throw new Error("status is required to update package state");
  }

  const existing = await findPackageById(packageId, dbClient);
  if (!existing) {
    throw packageNotFound();
  }

  const currentStatus =
    typeof existing.status === "string"
      ? existing.status.trim().toUpperCase()
      : null;

  if (currentStatus === statusValue) {
    return {
      updated: false,
      record: formatPackageRecord(existing),
      txHash: existing.tx_hash ?? null,
      hash: normalizeHash(existing.product_hash ?? null),
    };
  }

  const { record, normalizedHash, txHash, pinataBackup } =
    await applyPackageUpdate({
      existing,
      payload: {},
      overrides: { status: statusValue },
      wallet,
      dbClient,
      enforceAccess: false,
      hashMismatchReason: `On-chain hash mismatch detected while updating package status to ${statusValue}`,
      pinataErrorMessage:
        "?? Failed to back up package status update to Pinata:",
    });

  return {
    updated: true,
    record: formatPackageRecord(record),
    txHash,
    hash: normalizedHash,
    pinataCid: pinataBackup?.IpfsHash ?? record.pinata_cid ?? null,
  };
}
