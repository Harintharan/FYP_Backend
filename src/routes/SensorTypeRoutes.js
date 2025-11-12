import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  createSensorType,
  updateSensorType,
  deleteSensorType,
  listSensorTypeRecords,
  getSensorType,
} from "../controllers/SensorTypeController.js";

const router = Router();
const requireManufacturer = requireRegistrationRole("MANUFACTURER");

router.post("/", requireManufacturer, createSensorType);
router.get("/", requireManufacturer, listSensorTypeRecords);
router.get("/:id", requireManufacturer, getSensorType);
router.put("/:id", requireManufacturer, updateSensorType);
router.delete("/:id", requireManufacturer, deleteSensorType);

export default router;
