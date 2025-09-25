import { Router } from "express";
import { ZodError } from "zod";
import { keccak256, toUtf8Bytes } from "ethers";
import { query } from "../db.js";
import { RegistrationPayload } from "../domain/registration.schema.js";
import { stableStringify } from "../utils/canonicalize.js";
import { uuidToBytes16Hex, uuidToHex32 } from "../utils/uuidHex.js";
import { submitOnChain, registry } from "../eth/contract.js";
import { requireAuth, requireRole } from "../middleware/roles.js";

const router = Router();

class IntegrityError extends Error {}

function normalizeHash(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

async function ensureOnChainIntegrity(row) {
  const { client_uuid: clientUuid, payload_hash: storedHash, payload_canonical: canonical, payload } = row;

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
    throw new IntegrityError("Stored payload hash does not match canonical payload");
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

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = RegistrationPayload.parse(req.body);

    const canonical = stableStringify(parsed);
    const clientUuid = parsed.identification.uuid;
    const uuidHex = uuidToHex32(clientUuid);
    const uuidBytes16 = uuidToBytes16Hex(clientUuid);

    const alreadyOnChain = await registry.exists(uuidBytes16);
    if (alreadyOnChain) {
      return res.status(409).json({ error: "Registration already exists on-chain for this UUID" });
    }

    const { txHash, payloadHash } = await submitOnChain(
      uuidBytes16,
      parsed.type,
      canonical
    );

    const { rows } = await query(
      `INSERT INTO registrations (
        client_uuid,
        uuid_hex,
        reg_type,
        payload,
        payload_canonical,
        payload_hash,
        tx_hash,
        status,
        submitter_address
      ) VALUES (
        $1::uuid,
        $2,
        $3::reg_type,
        $4::jsonb,
        $5,
        $6,
        $7,
        'PENDING',
        $8
      )
      RETURNING id, status, tx_hash, payload_hash, created_at`,
      [
        clientUuid,
        uuidHex,
        parsed.type,
        parsed,
        canonical,
        payloadHash,
        txHash,
        req.wallet?.address ?? null,
      ]
    );

    const record = rows[0];

    return res.status(201).json({
      id: record.id,
      status: record.status,
      txHash: record.tx_hash,
      payloadHash: record.payload_hash,
      createdAt: record.created_at,
    });
  } catch (err) {
    console.error("POST /api/registrations error", err);
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to submit registration" });
  }
});

router.get("/pending", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, client_uuid, reg_type, tx_hash, payload_hash, payload_canonical, payload, created_at
       FROM registrations
       WHERE status = 'PENDING'
       ORDER BY created_at DESC`
    );

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
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM registrations WHERE id = $1::uuid`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Not found" });
    }

    await ensureOnChainIntegrity(rows[0]);

    return res.json(rows[0]);
  } catch (err) {
    if (err instanceof IntegrityError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("GET /api/registrations/:id error", err);
    return res.status(500).json({ error: "Failed to fetch registration" });
  }
});

router.patch("/:id/approve", requireRole("ADMIN"), async (req, res) => {
  try {
    const approverAddress = req.wallet.address;
    const { rows } = await query(
      `UPDATE registrations
         SET status = 'APPROVED',
             approved_at = now(),
             approved_by_address = $2
       WHERE id = $1::uuid AND status = 'PENDING'
       RETURNING id, status, approved_at, approved_by_address`,
      [req.params.id, approverAddress]
    );

    if (!rows[0]) {
      return res
        .status(400)
        .json({ error: "Invalid registration id or already processed" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/registrations/:id/approve error", err);
    return res.status(500).json({ error: "Failed to approve registration" });
  }
});

router.patch("/:id/reject", requireRole("ADMIN"), async (req, res) => {
  try {
    const approverAddress = req.wallet.address;
    const { rows } = await query(
      `UPDATE registrations
         SET status = 'REJECTED',
             approved_at = now(),
             approved_by_address = $2
       WHERE id = $1::uuid AND status = 'PENDING'
       RETURNING id, status, approved_at, approved_by_address`,
      [req.params.id, approverAddress]
    );

    if (!rows[0]) {
      return res
        .status(400)
        .json({ error: "Invalid registration id or already processed" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/registrations/:id/reject error", err);
    return res.status(500).json({ error: "Failed to reject registration" });
  }
});

export default router;
