import { randomUUID } from "node:crypto";
import {
  prepareCheckpointPersistence,
  formatCheckpointRecord,
  ensureCheckpointOnChainIntegrity,
} from "./checkpointIntegrityService.js";
import {
  insertCheckpoint,
  updateCheckpointRecord,
  findCheckpointById,
  listCheckpointsByOwnerUuid,
  listAllCheckpoints,
} from "../models/CheckpointRegistryModel.js";
import {
  registrationRequired,
  ownerForbidden,
  ownerMismatch,
  checkpointNotFound,
  hashMismatch,
} from "../errors/checkpointErrors.js";
import {
  registerCheckpointOnChain,
  updateCheckpointOnChain,
} from "../eth/checkpointContract.js";
import { normalizeHash } from "../utils/hash.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

function ensureOwnerAccess(registration, ownerUUID) {
  const registrationId = registration?.id;
  if (!registrationId) {
    throw registrationRequired();
  }
  if (ownerUUID && registrationId.toLowerCase() !== ownerUUID.toLowerCase()) {
    throw ownerForbidden();
  }
}

function resolveCheckpointActor({ walletAddress, ownerUUID, existing }) {
  if (walletAddress) {
    return walletAddress;
  }
  if (existing?.updated_by) {
    return existing.updated_by;
  }
  if (existing?.created_by) {
    return existing.created_by;
  }
  if (ownerUUID) {
    return ownerUUID;
  }
  return "checkpoint_service";
}

export async function upsertCheckpointForRegistration({
  registrationId,
  checkpointPayload,
  txHash,
  walletAddress,
  dbClient,
}) {
  if (!checkpointPayload) {
    return null;
  }

  const checkpointId = registrationId;
  const existing = await findCheckpointById(checkpointId, dbClient);

  const { normalized, canonical, payloadHash } = prepareCheckpointPersistence(
    checkpointId,
    checkpointPayload,
    {
      ownerUUID: registrationId,
    }
  );

  const pinataBackup = await backupRecordSafely({
    entity: "checkpoint",
    record: {
      id: checkpointId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress,
    operation: existing ? "update" : "create",
    identifier: checkpointId,
    errorMessage:
      "⚠️ Failed to back up checkpoint generated from registration:",
  });

  const pinataCid = pinataBackup?.IpfsHash ?? existing?.pinata_cid ?? null;
  const pinataPinnedAt = pinataBackup?.Timestamp
    ? new Date(pinataBackup.Timestamp)
    : existing?.pinata_pinned_at ?? null;

  const actor = resolveCheckpointActor({
    walletAddress,
    ownerUUID: normalized.ownerUUID,
    existing,
  });

  if (existing) {
    return updateCheckpointRecord(
      checkpointId,
      {
        name: normalized.name,
        address: normalized.address ?? null,
        latitude: normalized.latitude ?? null,
        longitude: normalized.longitude ?? null,
        state: normalized.state ?? null,
        country: normalized.country ?? null,
        ownerUUID: normalized.ownerUUID,
        checkpointHash: payloadHash,
        txHash,
        updatedBy: actor,
        pinataCid,
        pinataPinnedAt,
      },
      dbClient
    );
  }

  return insertCheckpoint(
    {
      id: checkpointId,
      name: normalized.name,
      address: normalized.address ?? null,
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      state: normalized.state ?? null,
      country: normalized.country ?? null,
      ownerUUID: normalized.ownerUUID,
      checkpointHash: payloadHash,
      txHash,
      createdBy: actor,
      pinataCid,
      pinataPinnedAt,
    },
    dbClient
  );
}

export async function createCheckpoint({ payload, registration, wallet }) {
  const checkpointId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareCheckpointPersistence(
    checkpointId,
    payload
  );

  ensureOwnerAccess(registration, normalized.ownerUUID);

  if (normalized.ownerUUID.toLowerCase() !== registration.id.toLowerCase()) {
    throw ownerMismatch();
  }

  const { txHash, checkpointHash } = await registerCheckpointOnChain(
    uuidToBytes16Hex(checkpointId),
    canonical
  );

  const normalizedOnChain = normalizeHash(checkpointHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during checkpoint registration",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "checkpoint",
    record: {
      id: checkpointId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: checkpointId,
    errorMessage: "⚠️ Failed to back up checkpoint to Pinata:",
  });

  const record = await insertCheckpoint({
    id: checkpointId,
    name: normalized.name,
    address: normalized.address ?? null,
    latitude: normalized.latitude ?? null,
    longitude: normalized.longitude ?? null,
    state: normalized.state ?? null,
    country: normalized.country ?? null,
    ownerUUID: normalized.ownerUUID,
    checkpointHash: payloadHash,
    txHash,
    createdBy:
      wallet?.walletAddress ??
      registration?.id ??
      normalized.ownerUUID ??
      "unknown",
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
  });

  const formatted = formatCheckpointRecord(record);
  return {
    statusCode: 201,
    body: {
      code: 201,
      message: "Checkpoint registered successfully",
      id: formatted.id,
      txHash: formatted.txHash,
    },
  };
}

export async function updateCheckpointDetails({
  id,
  payload,
  registration,
  wallet,
}) {
  const existing = await findCheckpointById(id);
  if (!existing) {
    throw checkpointNotFound();
  }

  ensureOwnerAccess(registration, existing.owner_uuid);

  const { normalized, canonical, payloadHash } = prepareCheckpointPersistence(
    id,
    payload,
    existing
  );

  if (
    normalized.ownerUUID.toLowerCase() !== existing.owner_uuid.toLowerCase()
  ) {
    throw ownerMismatch();
  }

  const { txHash, checkpointHash } = await updateCheckpointOnChain(
    uuidToBytes16Hex(id),
    canonical
  );

  const normalizedOnChain = checkpointHash
    ? normalizeHash(checkpointHash)
    : normalizeHash(payloadHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain hash mismatch detected during checkpoint update",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "checkpoint",
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
    errorMessage: "⚠️ Failed to back up checkpoint update to Pinata:",
  });

  const record = await updateCheckpointRecord(id, {
    name: normalized.name,
    address: normalized.address ?? null,
    latitude: normalized.latitude ?? null,
    longitude: normalized.longitude ?? null,
    state: normalized.state ?? null,
    country: normalized.country ?? null,
    ownerUUID: normalized.ownerUUID,
    checkpointHash: payloadHash,
    txHash,
    updatedBy:
      wallet?.walletAddress ??
      registration?.id ??
      normalized.ownerUUID ??
      existing.owner_uuid ??
      null,
    pinataCid: pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : existing.pinata_pinned_at ?? null,
  });

  const formatted = formatCheckpointRecord(record);
  return {
    statusCode: 200,
    body: {
      code: 200,
      message: "Checkpoint updated successfully",
      id: formatted.id,
      txHash: formatted.txHash,
      updatedAt: formatted.updatedAt,
    },
  };
}

export async function getCheckpointDetails({ id, registration }) {
  const existing = await findCheckpointById(id);
  if (!existing) {
    throw checkpointNotFound();
  }

  await ensureCheckpointOnChainIntegrity(existing);

  return {
    statusCode: 200,
    body: {
      ...formatCheckpointRecord(existing),
    },
  };
}

export async function listCheckpointsByOwner({ ownerUuid, registration }) {
  const rows = await listCheckpointsByOwnerUuid(ownerUuid);
  const formatted = await Promise.all(
    rows.map(async (row) => {
      await ensureCheckpointOnChainIntegrity(row);
      return formatCheckpointRecord(row);
    })
  );

  return {
    statusCode: 200,
    body: formatted,
  };
}

export async function listAllCheckpointRecords() {
  const rows = await listAllCheckpoints();
  const formatted = await Promise.all(
    rows.map(async (row) => {
      await ensureCheckpointOnChainIntegrity(row);
      return formatCheckpointRecord(row);
    })
  );
  return {
    statusCode: 200,
    body: formatted,
  };
}
