import { Router } from "express";
import {
  registerCheckpoint,
  updateCheckpoint,
  getCheckpoint,
  getAllCheckpoints,
} from "../controllers/CheckpointRegistryController.js";

const router = Router();

router.post("/checkpoints", registerCheckpoint);
router.put("/checkpoints/:checkpoint_id", updateCheckpoint);
router.get("/checkpoints/:checkpoint_id", getCheckpoint);
router.get("/checkpoints", getAllCheckpoints);

export default router;
