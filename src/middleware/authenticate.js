import jwt from "jsonwebtoken";
import { jwtPublicKey } from "../config.js";

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to request
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const [scheme, token] = authHeader.split(" ");

  if (!token || scheme.toLowerCase() !== "bearer") {
    return res.status(401).json({ error: "Invalid authorization header" });
  }

  try {
    const payload = jwt.verify(token, jwtPublicKey, {
      algorithms: ["RS256"],
    });

    if (!payload || typeof payload.sub !== "string") {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Attach user info to request
    req.walletAddress = payload.sub;
    req.userId = payload.uuid || null; // UUID from approved user
    req.role = payload.role || "USER";

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
