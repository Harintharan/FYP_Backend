import { Router } from "express";
import { requireRegistrationRole, requireAuth } from "../middleware/roles.js";
import {
  registerCheckpoint,
  updateCheckpoint,
  getCheckpoint,
  listCheckpointsForOwner,
  listAllCheckpoints,
} from "../controllers/CheckpointRegistryController.js";

const router = Router();

router.post(
  "/checkpoints",
  requireRegistrationRole("WAREHOUSE"),
  registerCheckpoint
);
router.put(
  "/checkpoints/:id",
  requireRegistrationRole("WAREHOUSE"),
  updateCheckpoint
);
router.get("/checkpoints/:id", requireAuth, getCheckpoint);
router.get(
  "/checkpoints/owner/:ownerUuid",
  requireAuth,
  listCheckpointsForOwner
);
router.get("/checkpoints", requireAuth, listAllCheckpoints);

export default router;
