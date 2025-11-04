import { Router } from "express";
import {
  createSensorData,
  listSensorDataByPackage,
  getSensorData,
} from "../controllers/sensorDataController.js";
import { requireAuth } from "../middleware/roles.js";

const router = Router();

router.post("/", requireAuth, createSensorData);
router.get("/package/:packageId", requireAuth, listSensorDataByPackage);
router.get("/:id", requireAuth, getSensorData);

export default router;
