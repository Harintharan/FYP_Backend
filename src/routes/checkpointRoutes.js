import { Router } from "express";
import { requireRegistrationRole, requireAuth } from "../middleware/roles.js";
import {
  registerCheckpoint,
  updateCheckpoint,
  getCheckpoint,
  listCheckpointsForOwner,
  listAllCheckpoints,
  listCheckpointsByUserId,
  getCheckpointByCheckpointId,
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
router.get(
  "/checkpoints/userid/:userId",
  requireAuth,
  listCheckpointsByUserId
);
router.get(
  "/checkpoints/checkpointid/:checkpointId",
  requireAuth,
  getCheckpointByCheckpointId
);
router.get(
  "/checkpoints/owner/:ownerUuid",
  requireAuth,
  listCheckpointsForOwner
);
router.get("/checkpoints/:id", requireAuth, getCheckpoint);
router.get("/checkpoints", requireAuth, listAllCheckpoints);

export default router;
