import { Router } from "express";
import {
  listShipmentSegments,
  listPendingShipmentSegments,
  updateShipmentSegmentStatusById,
  getShipmentSegmentPackages,
  acceptShipmentSegmentBySupplier,
} from "../controllers/ShipmentSegmentController.js";
import { requireAuth, requireRegistrationRole } from "../middleware/roles.js";

const router = Router();

router.get("/shipments/:id/segments", requireAuth, listShipmentSegments);
router.get(
  "/shipment-segments/pending",
  requireAuth,
  listPendingShipmentSegments
);

router.patch(
  "/shipment-segments/:id/status",
  requireAuth,
  updateShipmentSegmentStatusById
);
router.post(
  "/shipment-segments/accept/:id",
  requireRegistrationRole("SUPPLIER"),
  acceptShipmentSegmentBySupplier
);
router.get(
  "/shipment-segments/:id",
  requireRegistrationRole("MANUFACTURER"),
  getShipmentSegmentPackages
);

export default router;
