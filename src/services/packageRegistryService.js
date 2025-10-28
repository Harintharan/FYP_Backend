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

export async function createPackage({ payload, registration, wallet }) {
  const packageId = randomUUID();
  const sanitizedPayload =
    payload && typeof payload === "object" ? { ...payload } : {};
  if ("status" in sanitizedPayload) {
    delete sanitizedPayload.status;
  }
  const defaultStatus = "PACKAGE_READY_FOR_SHIPMENT";
  const { normalized, canonical, payloadHash } = preparePackagePersistence(
    packageId,
    sanitizedPayload,
    {},
    { status: defaultStatus }
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

  const defaults = derivePackagePayloadFromRecord(existing);
  ensureManufacturerAccess(registration, existing.manufacturer_uuid);

  const { normalized, canonical, payloadHash } = preparePackagePersistence(
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
      reason: "On-chain hash mismatch detected during package update",
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
    errorMessage: "⚠️ Failed to back up package update to Pinata:",
  });

  const record = await updatePackageRecord(id, {
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
      existing.manufacturer_uuid ??
      null,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : existing.pinata_pinned_at ?? null,
    status: normalized.status ?? null,
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
  const integrity = await ensurePackageOnChainIntegrity(existing);

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
