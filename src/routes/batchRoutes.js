import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  registerBatch,
  updateBatch,
  getBatch,
} from "../controllers/batchController.js";

const router = Router();

router.post("/", requireRegistrationRole("MANUFACTURER"), registerBatch);
router.put("/:id", requireRegistrationRole("MANUFACTURER"), updateBatch);
router.get("/:id", requireRegistrationRole("MANUFACTURER"), getBatch);

export default router;
