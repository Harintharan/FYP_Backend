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

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const SIGNING_MESSAGE_TEMPLATE = (address, nonce) =>
  `Registry Login\nAddress: ${address}\nNonce: ${nonce}`;

export async function issueNonce(req, res) {
  try {
    const address = req.query.address;
    if (typeof address !== "string" || !ADDRESS_REGEX.test(address)) {
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
    const { address, signature } = req.body ?? {};
    if (
      typeof address !== "string" ||
      typeof signature !== "string" ||
      !ADDRESS_REGEX.test(address)
    ) {
      return res.status(400).json({ error: "Invalid address or signature" });
    }

    const nonceRecord = await getNonce(address);
    if (!nonceRecord) {
      return res.status(400).json({ error: "Nonce not found" });
    }

    if (
      nonceRecord.expires_at &&
      new Date(nonceRecord.expires_at) < new Date()
    ) {
      await deleteNonce(address);
      return res.status(400).json({ error: "Nonce expired" });
    }

    const message = SIGNING_MESSAGE_TEMPLATE(
      address.toLowerCase(),
      nonceRecord.nonce
    );
    const recoveredAddress = verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    // Optionally delete nonce after successful login
    await deleteNonce(address);

    const role = (await getAccountRole(address)) ?? "USER";

    console.log("Authenticated address:", address);

    const token = jwt.sign({ role }, jwtPrivateKey, {
      algorithm: "RS256",
      expiresIn: "24h",
      subject: address,
    });

    return res.json({ token, role, address });
  } catch (err) {
    console.error("POST /auth/login error", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
