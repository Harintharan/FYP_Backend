import jwt from "jsonwebtoken";
import { jwtPublicKey } from "../config.js";

const DEFAULT_ROLE = "USER";

export function requireAuth(req, res, next) {
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

    const role = typeof payload.role === "string" ? payload.role : DEFAULT_ROLE;

    req.wallet = {
      address: payload.sub.toLowerCase(),
      role,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(requiredRole) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const role = req.wallet?.role || DEFAULT_ROLE;
      if (role !== requiredRole) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    });
  };
}
