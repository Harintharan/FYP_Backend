const express = require("express");
const router = express.Router();
const {
  registerSegmentAcceptance,
  updateSegmentAcceptance,getSegmentAcceptance ,getAllSegmentAcceptances
} = require("../controllers/ShipmentSegmentAcceptanceController");

router.post("/segment-acceptances", registerSegmentAcceptance);
router.put("/segment-acceptances/:acceptance_id", updateSegmentAcceptance);
router.get("/segment-acceptances/:acceptance_id", getSegmentAcceptance);
router.get("/segment-acceptances", getAllSegmentAcceptances);


module.exports = router;
