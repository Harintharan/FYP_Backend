import { keccak256, toUtf8Bytes } from "ethers";
import { RegistrationPayload } from "../domain/registration.schema.js";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { submitOnChain, registry } from "../eth/contract.js";
import {
  insertRegistration,
  findRegistrationById,
  findRegistrationByPublicKey,
  updateRegistration,
  findPendingRegistrationSummaries,
  findApprovedRegistrationSummaries,
  approveRegistration,
  rejectRegistration,
} from "../models/registrationModel.js";
import { backupRecord } from "../services/pinataBackupService.js";
import { allocateRegistrationUuid } from "../services/registrationIdAllocator.js";
import { normalizeHash, ensureOnChainIntegrity } from "../services/registrationIntegrityService.js";
import { respondWithRegistrationError } from "../middleware/registrationErrorMiddleware.js";
import { NotFoundError, RegistrationError } from "../errors/registrationErrors.js";

const MAX_PAYLOAD_BYTES = 8192;

export async function createRegistration(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);

    const existing = await findRegistrationByPublicKey(
      parsed.identification.publicKey
    );
    if (existing) {
      throw new RegistrationError(
        "Registration already exists for this User",
        409
      );
    }

    const { registrationId, uuidBytes16 } = await allocateRegistrationUuid();

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
    return respondWithRegistrationError(res, err);
  }
}

export async function updateRegistrationById(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);
    const registrationIdParam = req.params.id;

    const existing = await findRegistrationById(registrationIdParam);
    if (!existing) {
      throw new NotFoundError();
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
    return respondWithRegistrationError(res, err);
  }
}

export async function listPendingRegistrations(_req, res) {
  try {
    const rows = await findPendingRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(({ payload, payload_canonical, ...rest }) => rest);
    return res.json(sanitized);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function listApprovedRegistrations(_req, res) {
  try {
    const rows = await findApprovedRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(({ payload, payload_canonical, ...rest }) => rest);
    return res.json(sanitized);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function getRegistrationById(req, res) {
  try {
    const record = await findRegistrationById(req.params.id);
    if (!record) {
      throw new NotFoundError();
    }

    await ensureOnChainIntegrity(record);
    return res.json(record);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function approveRegistrationById(req, res) {
  try {
    const result = await approveRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      throw new RegistrationError(
        "Invalid registration ID or already processed",
        400
      );
    }
    return res.json(result);
  } catch (err) {
    return handleRegistrationError(res, err);
  }
}

export async function rejectRegistrationById(req, res) {
  try {
    const result = await rejectRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      throw new RegistrationError(
        "Invalid registration ID or already processed",
        400
      );
    }
    return res.json(result);
  } catch (err) {
    return handleRegistrationError(res, err);
  }
}
