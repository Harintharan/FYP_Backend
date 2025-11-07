import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { verifyMessage } from "ethers";
import {
  jwtPrivateKey,
  accessTokenExpiry,
  refreshTokenExpiryDays,
} from "../config.js";
import {
  upsertNonce,
  getNonce,
  deleteNonce,
  getAccountRole,
  getApprovedUserByAddress,
  createRefreshToken,
  findRefreshToken,
  updateRefreshTokenLastUsed,
  revokeRefreshToken,
  revokeAllRefreshTokensForAddress,
} from "../models/authModel.js";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Token expiration times sourced from environment
const ACCESS_TOKEN_EXPIRY = accessTokenExpiry;
const REFRESH_TOKEN_EXPIRY_DAYS = refreshTokenExpiryDays;

const SIGNING_MESSAGE_TEMPLATE = (address, nonce) =>
  `Registry Login\nAddress: ${address}\nNonce: ${nonce}`;

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createAccessToken(address, role, uuid = null) {
  const jwtPayload = { role };
  if (uuid) {
    jwtPayload.uuid = uuid;
  }

  return jwt.sign(jwtPayload, jwtPrivateKey, {
    algorithm: "RS256",
    expiresIn: ACCESS_TOKEN_EXPIRY,
    subject: address,
  });
}

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

    // Delete nonce after successful verification
    await deleteNonce(address);

    const approvedUser = await getApprovedUserByAddress(address);
    const role = (await getAccountRole(address, approvedUser)) ?? "USER";

    // Create access token
    const accessToken = createAccessToken(
      address,
      role,
      approvedUser?.id ?? null
    );

    // Create refresh token
    const refreshTokenValue = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const userAgent = req.headers["user-agent"] || null;
    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress || null;

    await createRefreshToken(
      address.toLowerCase(),
      refreshTokenValue,
      refreshTokenExpiresAt,
      userAgent,
      ipAddress
    );

    const responsePayload = {
      accessToken,
      refreshToken: refreshTokenValue,
      role,
      address,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };

    if (approvedUser?.id) {
      responsePayload.uuid = approvedUser.id;
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error("POST /auth/login error", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

export async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body ?? {};

    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Find the refresh token in the database
    const tokenRecord = await findRefreshToken(refreshToken);

    if (!tokenRecord) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Check if token is revoked
    if (tokenRecord.revoked) {
      return res.status(401).json({ error: "Refresh token has been revoked" });
    }

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: "Refresh token has expired" });
    }

    // Get user role and info
    const address = tokenRecord.address;
    const approvedUser = await getApprovedUserByAddress(address);
    const role = (await getAccountRole(address, approvedUser)) ?? "USER";

    // Create new access token
    const accessToken = createAccessToken(
      address,
      role,
      approvedUser?.id ?? null
    );

    // Invalidate old refresh token
    await revokeRefreshToken(refreshToken);

    // Generate new refresh token
    const newRefreshTokenValue = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const userAgent = req.headers["user-agent"] || null;
    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress || null;

    // Store new refresh token
    await createRefreshToken(
      address,
      newRefreshTokenValue,
      refreshTokenExpiresAt,
      userAgent,
      ipAddress
    );

    const responsePayload = {
      accessToken,
      refreshToken: newRefreshTokenValue,
      role,
      address,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };

    if (approvedUser?.id) {
      responsePayload.uuid = approvedUser.id;
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error("POST /auth/refresh error", err);
    return res.status(500).json({ error: "Failed to refresh token" });
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body ?? {};

    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Revoke the refresh token
    await revokeRefreshToken(refreshToken);

    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("POST /auth/logout error", err);
    return res.status(500).json({ error: "Logout failed" });
  }
}

export async function logoutAll(req, res) {
  try {
    const { address } = req.body ?? {};

    if (typeof address !== "string" || !ADDRESS_REGEX.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    // Revoke all refresh tokens for this address
    await revokeAllRefreshTokensForAddress(address.toLowerCase());

    return res.json({ message: "Logged out from all devices successfully" });
  } catch (err) {
    console.error("POST /auth/logout-all error", err);
    return res.status(500).json({ error: "Logout failed" });
  }
}
