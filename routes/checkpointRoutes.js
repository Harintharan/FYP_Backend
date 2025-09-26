const express = require("express");
const router = express.Router();
const {
  registerCheckpoint,
  updateCheckpoint,
  getCheckpoint,
  getAllCheckpoints
} = require("../controllers/CheckpointRegistryController");

router.post("/checkpoints", registerCheckpoint);
router.put("/checkpoints/:checkpoint_id", updateCheckpoint);
router.get("/checkpoints/:checkpoint_id", getCheckpoint);
router.get("/checkpoints", getAllCheckpoints);

module.exports = router;
