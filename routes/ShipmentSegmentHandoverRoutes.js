const express = require("express");
const router = express.Router();
const {
  registerHandover,
  updateHandover,
  getHandover,
  getAllHandovers
} = require("../controllers/ShipmentSegmentHandoverController");

router.post("/handovers", registerHandover);
router.put("/handovers/:handover_id", updateHandover);
router.get("/handovers/:handover_id", getHandover);
router.get("/handovers", getAllHandovers);


module.exports = router;
