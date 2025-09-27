import { Router } from "express";
import {
  registerBatch,
  updateBatch,
  getBatch,
} from "../controllers/batchController.js";

const router = Router();

router.post("/", registerBatch);
router.put("/:id", updateBatch);
router.get("/:id", getBatch);

export default router;
