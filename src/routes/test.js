import { Router } from "express";
import { keccak256, toUtf8Bytes } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";
import { RegistrationPayload } from "../domain/registration.schema.js";

const router = Router();

router.post("/hash", (req, res) => {
  try {
    const payload = req.body?.payload ?? req.body;
    if (!payload) {
      return res.status(400).json({ error: "payload is required" });
    }

    // Optional: validate shape if it looks like a registration
    let canonicalSource = payload;
    try {
      canonicalSource = RegistrationPayload.parse(payload);
    } catch (_) {
      // Ignore validation error; allow hashing arbitrary JSON
    }

    const canonical = stableStringify(canonicalSource);
    const hash = keccak256(toUtf8Bytes(canonical));

    return res.json({
      canonical,
      payloadHash: hash,
    });
  } catch (err) {
    console.error("POST /api/test/hash error", err);
    return res.status(500).json({ error: "Failed to compute hash" });
  }
});

export default router;
