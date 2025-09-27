import { Router } from "express";
import {
  registerSegmentAcceptance,
  updateSegmentAcceptance,
  getSegmentAcceptance,
  getAllSegmentAcceptances,
} from "../controllers/ShipmentSegmentAcceptanceController.js";

const router = Router();

router.post("/segment-acceptances", registerSegmentAcceptance);
router.put("/segment-acceptances/:acceptance_id", updateSegmentAcceptance);
router.get("/segment-acceptances/:acceptance_id", getSegmentAcceptance);
router.get("/segment-acceptances", getAllSegmentAcceptances);

export default router;
