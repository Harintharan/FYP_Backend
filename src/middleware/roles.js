import jwt from "jsonwebtoken";
import { jwtPublicKey } from "../config.js";
import { findApprovedRegistrationByPublicKey } from "../models/registrationModel.js";

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
      walletAddress: payload.sub,
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

export function requireRegistrationRole(expectedType) {
  return async (req, res, next) => {
    requireAuth(req, res, async () => {
      try {
        const walletAddress = req.wallet?.walletAddress;

        if (!walletAddress) {
          return res.status(401).json({ error: "Wallet address missing" });
        }

        const registration = await findApprovedRegistrationByPublicKey(
          walletAddress
        );
        if (!registration) {
          return res.status(403).json({ error: "User not registered" });
        }

        if (registration.reg_type !== expectedType) {
          return res.status(403).json({ error: "Access Denied" });
        }

        next();
      } catch (err) {
        console.error("requireRegistrationRole error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
}
