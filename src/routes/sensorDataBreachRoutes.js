import { Router } from "express";
import {
  createSensorDataBreach,
  listBreachesBySensorData,
  getSensorDataBreachEntry,
} from "../controllers/sensorDataBreachController.js";
import { requireAuth } from "../middleware/roles.js";

const router = Router();

router.post("/", requireAuth, createSensorDataBreach);
router.get("/sensor-data/:sensorDataId", requireAuth, listBreachesBySensorData);
router.get("/:id", requireAuth, getSensorDataBreachEntry);

export default router;
