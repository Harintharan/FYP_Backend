import { Router } from "express";
import { postTelemetry } from "../controllers/telemetryController.js";
import { requireAuth } from "../middleware/roles.js";

const router = Router();

router.post("/", requireAuth, postTelemetry);

export default router;
