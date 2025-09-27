// const express = require("express");
// const router = express.Router();
// const controller = require("../controllers/ProductRegistryController");

// router.post("/", controller.registerProduct);
// router.put("/:id", controller.updateProduct);
// router.get("/:id", controller.getProduct);
// router.get("/", controller.getAllProducts);

// module.exports = router;


const express = require("express");
const router = express.Router();
const productRegistryController = require("../controllers/ProductRegistryController");

// Register
router.post("/", productRegistryController.registerProduct);

// Update by product_id
router.put("/:product_id", productRegistryController.updateProduct);

// Get single by product_id
router.get("/:product_id", productRegistryController.getProduct);

// Get all
router.get("/", productRegistryController.getAllProducts);

module.exports = router;

