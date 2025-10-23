import { Router } from "express";
import {
  listShipmentSegments,
  updateShipmentSegmentStatusById,
} from "../controllers/ShipmentSegmentController.js";
import { requireAuth } from "../middleware/roles.js";

const router = Router();

router.get("/shipments/:id/segments", requireAuth, listShipmentSegments);

router.patch(
  "/shipment-segments/:id/status",
  requireAuth,
  updateShipmentSegmentStatusById
);

export default router;
