import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { verifyMessage } from "ethers";
import { jwtPrivateKey } from "../config.js";
import {
  upsertNonce,
  getNonce,
  deleteNonce,
  getAccountRole,
} from "../models/authModel.js";

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/;

const SIGNING_MESSAGE_TEMPLATE = (address, nonce) =>
  `Registry Login\nAddress: ${address}\nNonce: ${nonce}`;

export async function issueNonce(req, res) {
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

    await upsertNonce(address, nonce, expiresAt);

    const message = SIGNING_MESSAGE_TEMPLATE(address, nonce);

    return res.json({ address, nonce, message });
  } catch (err) {
    console.error("GET /auth/nonce error", err);
    return res.status(500).json({ error: "Failed to issue nonce" });
  }
}

export async function login(req, res) {
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

    const nonceRecord = await getNonce(address);
    if (!nonceRecord) {
      return res.status(400).json({ error: "Nonce not found" });
    }

    if (nonceRecord.expires_at && new Date(nonceRecord.expires_at) < new Date()) {
      await deleteNonce(address);
      return res.status(400).json({ error: "Nonce expired" });
    }

    const message = SIGNING_MESSAGE_TEMPLATE(address, nonceRecord.nonce);
    const recoveredAddress = verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== address) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    await deleteNonce(address);

    const role = (await getAccountRole(address)) ?? "USER";

    const token = jwt.sign(
      { role },
      jwtPrivateKey,
      {
        algorithm: "RS256",
        expiresIn: "2h",
        subject: address,
      }
    );

    return res.json({ token, role, address });
  } catch (err) {
    console.error("POST /auth/login error", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
