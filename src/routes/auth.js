import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage } from "ethers";
import { query } from "../db.js";
import { jwtPrivateKey } from "../config.js";

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/;
const SIGNING_MESSAGE_TEMPLATE = (address, nonce) =>
  `Registry Login\nAddress: ${address}\nNonce: ${nonce}`;

const router = Router();

router.get("/nonce", async (req, res) => {
  try {
    const inputAddress = req.query.address;
    if (typeof inputAddress !== "string") {
      return res
        .status(400)
        .json({ error: "address query parameter is required" });
    }

    const address = inputAddress.toLowerCase();
    if (!ADDRESS_REGEX.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `INSERT INTO auth_nonces (address, nonce, issued_at, expires_at)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (address)
       DO UPDATE SET nonce = EXCLUDED.nonce, issued_at = now(), expires_at = EXCLUDED.expires_at`,
      [address, nonce, expiresAt]
    );

    const message = SIGNING_MESSAGE_TEMPLATE(address, nonce);

    return res.json({
      address,
      nonce,
      message,
    });
  } catch (err) {
    console.error("GET /auth/nonce error", err);
    return res.status(500).json({ error: "Failed to issue nonce" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { address: suppliedAddress, signature } = req.body ?? {};
    if (typeof suppliedAddress !== "string" || typeof signature !== "string") {
      return res
        .status(400)
        .json({ error: "address and signature are required" });
    }

    const address = suppliedAddress.toLowerCase();
    if (!ADDRESS_REGEX.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const { rows } = await query(
      `SELECT nonce, expires_at FROM auth_nonces WHERE address = $1`,
      [address]
    );

    const nonceRecord = rows[0];
    if (!nonceRecord) {
      return res.status(400).json({ error: "Nonce not found" });
    }

    if (
      nonceRecord.expires_at &&
      new Date(nonceRecord.expires_at) < new Date()
    ) {
      await query(`DELETE FROM auth_nonces WHERE address = $1`, [address]);
      return res.status(400).json({ error: "Nonce expired" });
    }

    const message = SIGNING_MESSAGE_TEMPLATE(address, nonceRecord.nonce);
    const recoveredAddress = verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== address) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    await query(`DELETE FROM auth_nonces WHERE address = $1`, [address]);

    console.log("Address:", address);

    const accountResult = await query(
      `SELECT role FROM accounts WHERE LOWER(address) = LOWER($1)`,
      [address]
    );
    console.log("accountResult:", accountResult);

    const role = accountResult.rows[0]?.role ?? "USER";
    console.log("role:", role);

    const token = jwt.sign({ role }, jwtPrivateKey, {
      algorithm: "RS256",
      expiresIn: "2h",
      subject: address,
    });

    return res.json({
      token,
      role,
      address,
    });
  } catch (err) {
    console.error("POST /auth/login error", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
});

export default router;
