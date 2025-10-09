import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { keccak256, toUtf8Bytes } from "ethers";
import { RegistrationPayload } from "../domain/registration.schema.js";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { submitOnChain, registry } from "../eth/contract.js";
import {
  insertRegistration,
  findRegistrationById,
  updateRegistration,
  findPendingRegistrationSummaries,
  findApprovedRegistrationSummaries,
  approveRegistration,
  rejectRegistration,
} from "../models/registrationModel.js";
import { backupRecord } from "../services/pinataBackupService.js";

class IntegrityError extends Error {}

// Must stay in sync with RegistrationRegistry.MAX_PAYLOAD_BYTES on-chain
const MAX_PAYLOAD_BYTES = 8192;

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
    id: registrationId,
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

  const uuidBytes16 = uuidToBytes16Hex(registrationId);
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
    const registrationId = randomUUID();
    const payloadWithUuid = {
      ...parsed,
      identification: {
        ...parsed.identification,
        uuid: registrationId,
      },
    };
    const canonical = stableStringify(payloadWithUuid);
    const canonicalSize = Buffer.byteLength(canonical, "utf8");
    if (canonicalSize > MAX_PAYLOAD_BYTES) {
      return res
        .status(413)
        .json({ error: `Payload exceeds limit (${MAX_PAYLOAD_BYTES} bytes)` });
    }
    const canonicalHash = normalizeHash(keccak256(toUtf8Bytes(canonical)));
    const uuidBytes16 = uuidToBytes16Hex(registrationId);

    const alreadyOnChain = await registry.exists(uuidBytes16);
    if (alreadyOnChain) {
      return res
        .status(409)
        .json({ error: "Registration already exists on-chain for this UUID" });
    }

    const { txHash, payloadHash } = await submitOnChain(
      uuidBytes16,
      payloadWithUuid.type,
      canonical,
      false
    );
    const normalizedPayloadHash = normalizeHash(payloadHash);
    if (!normalizedPayloadHash || normalizedPayloadHash !== canonicalHash) {
      console.error("On-chain payload hash mismatch detected during create", {
        canonicalHash,
        payloadHash,
      });
      return res
        .status(502)
        .json({ error: "On-chain payload hash mismatch detected" });
    }

    const dbPayload = {
      id: registrationId,
      regType: payloadWithUuid.type,
      publicKey: payloadWithUuid.identification.publicKey,
      payload: payloadWithUuid,
      canonical,
      payloadHash: normalizedPayloadHash,
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
          identifier: registrationId,
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

export async function updateRegistrationById(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);
    const registrationIdParam = req.params.id;

    const existing = await findRegistrationById(registrationIdParam);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const incomingUuid = req.body?.identification?.uuid;
    if (incomingUuid && existing.id !== incomingUuid) {
      return res
        .status(400)
        .json({ error: "UUID cannot be changed for an update" });
    }

    const payloadWithUuid = {
      ...parsed,
      identification: {
        ...parsed.identification,
        uuid: existing.id,
      },
    };

    const canonical = stableStringify(payloadWithUuid);
    const canonicalSize = Buffer.byteLength(canonical, "utf8");
    if (canonicalSize > MAX_PAYLOAD_BYTES) {
      return res
        .status(413)
        .json({ error: `Payload exceeds limit (${MAX_PAYLOAD_BYTES} bytes)` });
    }
    const canonicalHash = normalizeHash(keccak256(toUtf8Bytes(canonical)));
    const uuidBytes16 = uuidToBytes16Hex(existing.id);

    const { txHash, payloadHash } = await submitOnChain(
      uuidBytes16,
      payloadWithUuid.type,
      canonical,
      true
    );
    const normalizedPayloadHash = normalizeHash(payloadHash);
    if (!normalizedPayloadHash || normalizedPayloadHash !== canonicalHash) {
      console.error("On-chain payload hash mismatch detected during update", {
        canonicalHash,
        payloadHash,
        registrationId: existing.id,
      });
      return res
        .status(502)
        .json({ error: "On-chain payload hash mismatch detected" });
    }

    const updatePayload = {
      id: existing.id,
      regType: payloadWithUuid.type,
      publicKey: payloadWithUuid.identification.publicKey,
      payload: payloadWithUuid,
      canonical,
      payloadHash: normalizedPayloadHash,
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
          identifier: existing.id,
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
      status: updated.status,
      txHash: updated.tx_hash,
      payloadHash: updated.payload_hash,
      pinataCid: updated.pinata_cid ?? null,
      pinataTimestamp: updated.pinata_pinned_at ?? null,
      updatedAt: updated.updated_at,
    });
  } catch (err) {
    console.error("PUT /api/registrations/:id error", err);
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

export async function listApprovedRegistrations(_req, res) {
  try {
    const rows = await findApprovedRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(({ payload, payload_canonical, ...rest }) => rest);
    return res.json(sanitized);
  } catch (err) {
    if (err instanceof IntegrityError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("GET /api/registrations/approved error", err);
    return res.status(500).json({ error: "Failed to fetch registrations" });
  }
}

export async function getRegistrationById(req, res) {
  try {
    const record = await findRegistrationById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Not found" });
    }

    await ensureOnChainIntegrity(record);
    return res.json(record);
  } catch (err) {
    if (err instanceof IntegrityError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("GET /api/registrations/:id error", err);
    return res.status(500).json({ error: "Failed to fetch registration" });
  }
}

export async function approveRegistrationById(req, res) {
  try {
    const result = await approveRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      return res
        .status(400)
        .json({ error: "Invalid registration ID or already processed" });
    }
    return res.json(result);
  } catch (err) {
    console.error("PATCH /api/registrations/:id/approve error", err);
    return res.status(500).json({ error: "Failed to approve registration" });
  }
}

export async function rejectRegistrationById(req, res) {
  try {
    const result = await rejectRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      return res
        .status(400)
        .json({ error: "Invalid registration ID or already processed" });
    }
    return res.json(result);
  } catch (err) {
    console.error("PATCH /api/registrations/:id/reject error", err);
    return res.status(500).json({ error: "Failed to reject registration" });
  }
}
