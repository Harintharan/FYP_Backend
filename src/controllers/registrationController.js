import { ZodError } from "zod";
import { keccak256, toUtf8Bytes } from "ethers";
import { RegistrationPayload } from "../domain/registration.schema.js";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex, uuidToHex32 } from "../utils/uuidHex.js";
import { submitOnChain, registry } from "../eth/contract.js";
import {
  insertRegistration,
  findByClientUuid,
  updateRegistration,
  findPendingRegistrationSummaries,
  approveRegistration,
  rejectRegistration,
} from "../models/registrationModel.js";
import { backupRecord } from "../services/pinataBackupService.js";

class IntegrityError extends Error {}

function normalizeHash(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function ensureOnChainIntegrity(row) {
  const {
    client_uuid: clientUuid,
    payload_hash: storedHash,
    payload_canonical: canonical,
    payload,
  } = row;

  if (!canonical || typeof canonical !== "string") {
    throw new IntegrityError("Canonical payload missing or invalid");
  }

  if (!payload) {
    throw new IntegrityError("Payload JSON missing");
  }

  const canonicalFromPayload = stableStringify(payload);
  if (canonicalFromPayload !== canonical) {
    throw new IntegrityError("Payload data mismatch detected");
  }

  const canonicalHash = normalizeHash(keccak256(toUtf8Bytes(canonical)));
  const normalizedStored = normalizeHash(storedHash);
  if (normalizedStored && normalizedStored !== canonicalHash) {
    throw new IntegrityError(
      "Stored payload hash does not match canonical payload"
    );
  }

  const uuidBytes16 = uuidToBytes16Hex(clientUuid);
  const exists = await registry.exists(uuidBytes16);
  if (!exists) {
    throw new IntegrityError("Registration record not found on-chain");
  }

  const onChain = await registry.getRegistration(uuidBytes16);
  const chainHash = normalizeHash(onChain.payloadHash ?? onChain[0]);
  if (!chainHash) {
    throw new IntegrityError("On-chain payload hash missing");
  }

  if (chainHash !== canonicalHash) {
    throw new IntegrityError("On-chain payload hash mismatch detected");
  }
}

export async function createRegistration(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);
    const canonical = stableStringify(parsed);
    const clientUuid = parsed.identification.uuid;
    const uuidHex = uuidToHex32(clientUuid);
    const uuidBytes16 = uuidToBytes16Hex(clientUuid);

    const alreadyOnChain = await registry.exists(uuidBytes16);
    if (alreadyOnChain) {
      return res
        .status(409)
        .json({ error: "Registration already exists on-chain for this UUID" });
    }

    const { txHash, payloadHash } = await submitOnChain(
      uuidBytes16,
      parsed.type,
      canonical,
      false
    );

    const dbPayload = {
      clientUuid,
      uuidHex,
      regType: parsed.type,
      publicKey: parsed.identification.publicKey,
      payload: parsed,
      canonical,
      payloadHash,
      txHash,
      submitterAddress: req.wallet?.walletAddress ?? null,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "user_registration",
        {
          ...dbPayload,
          walletAddress: req.wallet?.walletAddress ?? null,
        },
        {
          operation: "create",
          identifier: clientUuid,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up registration to Pinata:",
        backupErr
      );
    }

    const record = await insertRegistration({
      ...dbPayload,
      pinataCid: pinataBackup?.IpfsHash ?? null,
      pinataPinnedAt: pinataBackup?.Timestamp ?? null,
    });

    return res.status(201).json({
      id: record.id,
      clientUuid: record.client_uuid,
      status: record.status,
      txHash: record.tx_hash,
      payloadHash: record.payload_hash,
      pinataCid: record.pinata_cid ?? null,
      pinataTimestamp: record.pinata_pinned_at ?? null,
      createdAt: record.created_at,
    });
  } catch (err) {
    console.error("POST /api/registrations error", err);
    if (err instanceof ZodError) {
      return res.status(400).json({ errors: formatZodError(err) });
    }
    return res.status(500).json({ error: "Failed to submit registration" });
  }
}

export async function updateRegistrationByClient(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);
    const clientUuidParam = req.params.clientUuid;

    const existing = await findByClientUuid(clientUuidParam);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    if (existing.client_uuid !== parsed.identification.uuid) {
      return res
        .status(400)
        .json({ error: "UUID cannot be changed for an update" });
    }

    const canonical = stableStringify(parsed);
    const uuidHex = uuidToHex32(existing.client_uuid);
    const uuidBytes16 = uuidToBytes16Hex(existing.client_uuid);

    const { txHash, payloadHash } = await submitOnChain(
      uuidBytes16,
      parsed.type,
      canonical,
      true
    );

    const updatePayload = {
      clientUuid: existing.client_uuid,
      uuidHex,
      regType: parsed.type,
      publicKey: parsed.identification.publicKey,
      payload: parsed,
      canonical,
      payloadHash,
      txHash,
      submitterAddress: req.wallet?.walletAddress ?? null,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "user_registration",
        {
          ...existing,
          ...updatePayload,
        },
        {
          operation: "update",
          identifier: existing.client_uuid,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up registration update to Pinata:",
        backupErr
      );
    }

    updatePayload.pinataCid =
      pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null;
    updatePayload.pinataPinnedAt =
      pinataBackup?.Timestamp ?? existing.pinata_pinned_at ?? null;

    const updated = await updateRegistration(updatePayload);

    return res.json({
      id: updated.id,
      clientUuid: updated.client_uuid,
      status: updated.status,
      txHash: updated.tx_hash,
      payloadHash: updated.payload_hash,
      pinataCid: updated.pinata_cid ?? null,
      pinataTimestamp: updated.pinata_pinned_at ?? null,
      updatedAt: updated.updated_at,
    });
  } catch (err) {
    console.error("PUT /api/registrations/:clientUuid error", err);
    if (err instanceof ZodError) {
      return res.status(400).json({ errors: formatZodError(err) });
    }
    return res.status(500).json({ error: "Failed to update registration" });
  }
}

export async function listPendingRegistrations(_req, res) {
  try {
    const rows = await findPendingRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(({ payload, payload_canonical, ...rest }) => rest);
    return res.json(sanitized);
  } catch (err) {
    if (err instanceof IntegrityError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("GET /api/registrations/pending error", err);
    return res.status(500).json({ error: "Failed to fetch registrations" });
  }
}

export async function getRegistrationByClient(req, res) {
  try {
    const record = await findByClientUuid(req.params.clientUuid);
    if (!record) {
      return res.status(404).json({ error: "Not found" });
    }

    await ensureOnChainIntegrity(record);
    return res.json(record);
  } catch (err) {
    if (err instanceof IntegrityError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("GET /api/registrations/:clientUuid error", err);
    return res.status(500).json({ error: "Failed to fetch registration" });
  }
}

export async function approveRegistrationByClient(req, res) {
  try {
    const result = await approveRegistration(
      req.params.clientUuid,
      req.wallet.walletAddress
    );
    if (!result) {
      return res
        .status(400)
        .json({ error: "Invalid registration client UUID or already processed" });
    }
    return res.json(result);
  } catch (err) {
    console.error("PATCH /api/registrations/:clientUuid/approve error", err);
    return res.status(500).json({ error: "Failed to approve registration" });
  }
}

export async function rejectRegistrationByClient(req, res) {
  try {
    const result = await rejectRegistration(
      req.params.clientUuid,
      req.wallet.walletAddress
    );
    if (!result) {
      return res
        .status(400)
        .json({ error: "Invalid registration client UUID or already processed" });
    }
    return res.json(result);
  } catch (err) {
    console.error("PATCH /api/registrations/:clientUuid/reject error", err);
    return res.status(500).json({ error: "Failed to reject registration" });
  }
}
