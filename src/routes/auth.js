import { Router } from "express";
import {
  issueNonce,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
} from "../controllers/authController.js";

const router = Router();

// Get nonce for wallet address
router.get("/nonce", issueNonce);

// Login with signature
router.post("/login", login);

// Refresh access token using refresh token
router.post("/refresh", refreshAccessToken);

// Logout (revoke single refresh token)
router.post("/logout", logout);

// Logout from all devices (revoke all refresh tokens for address)
router.post("/logout-all", logoutAll);

export default router;
