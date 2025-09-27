import { Router } from "express";
import {
  registerShipment,
  updateShipment,
  getShipment,
  getAllShipments,
} from "../controllers/ShipmentRegistryController.js";

const router = Router();

router.post("/shipments", registerShipment);
router.put("/shipments/:shipment_id", updateShipment);
router.get("/shipments/:shipment_id", getShipment);
router.get("/shipments", getAllShipments);

export default router;
