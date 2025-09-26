import { Router } from "express";
import { issueNonce, login } from "../controllers/authController.js";

const router = Router();

router.get("/nonce", issueNonce);
router.post("/login", login);

export default router;
