const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batchController");

router.post("/", batchController.registerBatch);
router.put("/:id", batchController.updateBatch);
router.get("/:id", batchController.getBatch);

module.exports = router;
