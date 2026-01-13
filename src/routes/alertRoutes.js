import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  getManufacturerAlerts,
  getSupplierAlerts,
} from "../controllers/alertController.js";

const router = express.Router();


// Manufacturer alerts
router.get("/manufacturer", authenticate, (req, res, next) => {
  getManufacturerAlerts(req, res, next);
});

// Supplier alerts
router.get("/supplier", authenticate, (req, res, next) => {
  getSupplierAlerts(req, res, next);
});

export default router;
