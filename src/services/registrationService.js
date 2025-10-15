import { keccak256, toUtf8Bytes } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { submitOnChain, registry } from "../eth/contract.js";
import { allocateRegistrationUuid } from "./registrationIdAllocator.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { normalizeHash } from "../utils/hash.js";
import {
  ensureHashMatches,
  enforcePayloadSize,
  DEFAULT_MAX_PAYLOAD_BYTES,
} from "../utils/integrity.js";
import {
  insertRegistration,
  updateRegistration,
  findRegistrationById,
  findRegistrationByPublicKey,
} from "../models/registrationModel.js";
import { upsertCheckpointForRegistration } from "./checkpointService.js";
import { runInTransaction } from "../utils/dbTransactions.js";
import {
  RegistrationError,
  NotFoundError,
  DuplicateRegistrationError,
  RegistrationOnChainDuplicateError,
} from "../errors/registrationErrors.js";

const toDateOrNull = (timestamp) =>
  timestamp ? new Date(timestamp) : null;

const withPayloadUuid = (payload, uuid) => ({
  ...payload,
  identification: {
    ...payload.identification,
    uuid,
  },
});

async function runWithPersistenceGuard(task, failureMessage) {
  try {
    return await task();
  } catch (err) {
    if (err instanceof RegistrationError) {
      throw err;
    }
    console.error(`❌ ${failureMessage}:`, err);
    throw new RegistrationError(failureMessage, 500);
  }
}

export async function createRegistrationRecord({
  payload,
  walletAddress,
}) {
  const existing = await findRegistrationByPublicKey(
    payload.identification.publicKey
  );
  if (existing) {
    throw new DuplicateRegistrationError();
  }

  const { registrationId, uuidBytes16 } = await allocateRegistrationUuid();
  const payloadWithUuid = withPayloadUuid(payload, registrationId);
  const canonical = stableStringify(payloadWithUuid);
  enforcePayloadSize(canonical, DEFAULT_MAX_PAYLOAD_BYTES);

  const canonicalHash = normalizeHash(
    keccak256(toUtf8Bytes(canonical))
  );

  const alreadyOnChain = await registry.exists(uuidBytes16);
  if (alreadyOnChain) {
    throw new RegistrationOnChainDuplicateError();
  }

  const { txHash, payloadHash } = await submitOnChain(
    uuidBytes16,
    payloadWithUuid.type,
    canonical,
    false
  );

  const normalizedPayloadHash = ensureHashMatches({
    canonicalHash,
    payloadHash,
    context: { canonicalHash, payloadHash },
  });

  const dbPayload = {
    id: registrationId,
    regType: payloadWithUuid.type,
    publicKey: payloadWithUuid.identification.publicKey,
    payload: payloadWithUuid,
    canonical,
    payloadHash: normalizedPayloadHash,
    txHash,
    submitterAddress: walletAddress ?? null,
  };

  const pinataBackup = await backupRecordSafely({
    entity: "user_registration",
    record: dbPayload,
    walletAddress,
    operation: "create",
    identifier: registrationId,
    errorMessage: "⚠️ Failed to back up registration to Pinata.",
  });

  const record = await runWithPersistenceGuard(
    () =>
      runInTransaction(async (client) => {
        const row = await insertRegistration(
          {
            ...dbPayload,
            pinataCid: pinataBackup?.IpfsHash ?? null,
            pinataPinnedAt: toDateOrNull(pinataBackup?.Timestamp),
          },
          client
        );

        await upsertCheckpointForRegistration({
          registrationId,
          checkpointPayload: payloadWithUuid.checkpoint,
          txHash,
          walletAddress: walletAddress ?? null,
          dbClient: client,
        });

        return row;
      }),
    "Failed to persist registration data"
  );

  return {
    status: 201,
    body: {
      id: record.id,
      status: record.status,
      txHash: record.tx_hash,
      payloadHash: record.payload_hash,
      pinataCid: record.pinata_cid ?? null,
      pinataTimestamp: record.pinata_pinned_at ?? null,
      createdAt: record.created_at,
    },
  };
}

export async function updateRegistrationRecord({
  registrationId,
  payload,
  walletAddress,
}) {
  const existing = await findRegistrationById(registrationId);
  if (!existing) {
    throw new NotFoundError();
  }

  const payloadWithUuid = withPayloadUuid(payload, existing.id);
  const canonical = stableStringify(payloadWithUuid);
  enforcePayloadSize(canonical, DEFAULT_MAX_PAYLOAD_BYTES);

  const canonicalHash = normalizeHash(
    keccak256(toUtf8Bytes(canonical))
  );
  const uuidBytes16 = uuidToBytes16Hex(existing.id);

  const { txHash, payloadHash } = await submitOnChain(
    uuidBytes16,
    payloadWithUuid.type,
    canonical,
    true
  );

  const normalizedPayloadHash = ensureHashMatches({
    canonicalHash,
    payloadHash,
    context: { canonicalHash, payloadHash, registrationId },
  });

  const updatePayload = {
    id: existing.id,
    regType: payloadWithUuid.type,
    publicKey: payloadWithUuid.identification.publicKey,
    payload: payloadWithUuid,
    canonical,
    payloadHash: normalizedPayloadHash,
    txHash,
    submitterAddress: walletAddress ?? null,
  };

  const pinataBackup = await backupRecordSafely({
    entity: "user_registration",
    record: {
      ...existing,
      ...updatePayload,
    },
    walletAddress,
    operation: "update",
    identifier: existing.id,
    errorMessage: "⚠️ Failed to back up registration update to Pinata:",
  });

  updatePayload.pinataCid =
    pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null;
  updatePayload.pinataPinnedAt =
    toDateOrNull(pinataBackup?.Timestamp) ??
    existing.pinata_pinned_at ??
    null;

  const updated = await runWithPersistenceGuard(
    () =>
      runInTransaction(async (client) => {
        const row = await updateRegistration(updatePayload, client);

        await upsertCheckpointForRegistration({
          registrationId: existing.id,
          checkpointPayload: payloadWithUuid.checkpoint,
          txHash,
          walletAddress: walletAddress ?? null,
          dbClient: client,
        });

        return row;
      }),
    "Failed to persist registration update"
  );

  return {
    status: 200,
    body: {
      id: updated.id,
      status: updated.status,
      txHash: updated.tx_hash,
      payloadHash: updated.payload_hash,
      pinataCid: updated.pinata_cid ?? null,
      pinataTimestamp: updated.pinata_pinned_at ?? null,
      updatedAt: updated.updated_at,
    },
  };
}
