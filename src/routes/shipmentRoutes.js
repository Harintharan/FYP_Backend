const express = require("express");
const router = express.Router();
const {
  registerShipment,
  updateShipment,
  getShipment,
  getAllShipments,
  getShipmentsByProduct
} = require("../controllers/ShipmentRegistryController");

router.post("/shipments", registerShipment);
router.put("/shipments/:shipment_id", updateShipment);
router.get("/shipments/:shipment_id", getShipment);
router.get("/shipments", getAllShipments);
//router.get("/shipments/product/:uuid", getShipmentsByProduct);

module.exports = router;
