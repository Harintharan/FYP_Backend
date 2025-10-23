import { Router } from "express";
import {
  registerShipment,
  updateShipment,
  getShipment,
  getAllShipments,
} from "../controllers/ShipmentRegistryController.js";

const router = Router();

router.post("/shipments", registerShipment);
router.put("/shipments/:id", updateShipment);
router.get("/shipments/:id", getShipment);
router.get("/shipments", getAllShipments);

export default router;
