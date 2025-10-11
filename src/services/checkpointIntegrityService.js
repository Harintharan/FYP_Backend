import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { CheckpointPayload } from "../domain/checkpoint.schema.js";
import { normalizeHash } from "./registrationIntegrityService.js";
import { fetchCheckpointOnChain } from "../eth/checkpointContract.js";
import { CheckpointErrorCodes, hashMismatch } from "../errors/checkpointErrors.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const CHECKPOINT_FIELDS = [
  "name",
  "address",
  "latitude",
  "longitude",
  "ownerUUID",
  "ownerType",
  "checkpointType",
];

const EMPTY = "";

const coercePayload = (raw) => {
  const safe = (value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const str = typeof value === "string" ? value : String(value);
    const trimmed = str.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  };

  return {
    name: safe(raw.name),
    address: safe(raw.address),
    latitude: safe(raw.latitude),
    longitude: safe(raw.longitude),
    ownerUUID: safe(raw.ownerUUID ?? raw.owner_uuid),
    ownerType: safe(raw.ownerType ?? raw.owner_type),
    checkpointType: safe(raw.checkpointType ?? raw.checkpoint_type),
  };
};

export function normalizeCheckpointPayload(rawPayload, defaults = {}) {
  const coerced = { ...defaults, ...coercePayload(rawPayload) };
  return CheckpointPayload.parse(coerced);
}

export function buildCheckpointCanonicalPayload(checkpointId, payload) {
  const entries = {
    id: checkpointId,
  };
  for (const field of CHECKPOINT_FIELDS) {
    entries[field] = payload[field] ?? EMPTY;
  }
  return stableStringify(entries);
}

export function computeCheckpointHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function prepareCheckpointPersistence(checkpointId, rawPayload, defaults = {}) {
  const normalized = normalizeCheckpointPayload(rawPayload, defaults);
  const canonical = buildCheckpointCanonicalPayload(checkpointId, normalized);
  const payloadHash = computeCheckpointHashFromCanonical(canonical);
  return {
    normalized,
    canonical,
    payloadHash,
  };
}

export async function ensureCheckpointOnChainIntegrity(record) {
  const id = record.id ?? record.checkpoint_uuid ?? record.checkpointUUID ?? null;
  const storedHash = record.checkpoint_hash ?? record.checkpointHash;

  if (!id) {
    throw new Error("Checkpoint record missing id");
  }
  if (!storedHash) {
    throw new Error("Checkpoint record missing stored hash");
  }

  const normalizedPayload = normalizeCheckpointPayload(record);
  const canonical = buildCheckpointCanonicalPayload(id, normalizedPayload);
  const computedHash = computeCheckpointHashFromCanonical(canonical);
  const normalizedStored = normalizeHash(storedHash);
  const normalizedComputed = normalizeHash(computedHash);

  if (normalizedStored !== normalizedComputed) {
    throw hashMismatch({
      reason: "Stored hash does not match recomputed payload",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: CheckpointErrorCodes.HASH_MISMATCH,
    });
  }

  const onChain = await fetchCheckpointOnChain(uuidToBytes16Hex(id));
  if (!onChain.hash) {
    throw hashMismatch({
      reason: "Checkpoint not found on-chain",
      stored: normalizedStored,
      computed: normalizedComputed,
      code: CheckpointErrorCodes.HASH_MISMATCH,
    });
  }

  const normalizedOnChain = normalizeHash(onChain.hash);
  if (normalizedOnChain !== normalizedComputed) {
    throw hashMismatch({
      reason: "On-chain checkpoint hash mismatch",
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  return { canonical, normalizedPayload, hash: normalizedComputed };
}

export function formatCheckpointRecord(record) {
  return {
    id: record.id ?? record.checkpoint_uuid ?? record.checkpointUUID ?? null,
    name: record.name ?? null,
    address: record.address ?? null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    ownerUUID: record.owner_uuid ?? record.ownerUUID ?? null,
    ownerType: record.owner_type ?? record.ownerType ?? null,
    checkpointType: record.checkpoint_type ?? record.checkpointType ?? null,
    checkpointHash: normalizeHash(record.checkpoint_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    updatedBy: record.updated_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}
