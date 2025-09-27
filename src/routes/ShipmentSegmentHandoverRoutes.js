import { Router } from "express";
import {
  registerHandover,
  updateHandover,
  getHandover,
  getAllHandovers,
} from "../controllers/ShipmentSegmentHandoverController.js";

const router = Router();

router.post("/handovers", registerHandover);
router.put("/handovers/:handover_id", updateHandover);
router.get("/handovers/:handover_id", getHandover);
router.get("/handovers", getAllHandovers);

export default router;
