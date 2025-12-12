import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  getManufacturerDashboard,
  getSupplierDashboard,
} from "../controllers/dashboardController.js";

const router = Router();

// Manufacturer dashboard
router.get(
  "/manufacturer",
  authenticate,
  requireRegistrationRole("MANUFACTURER"),
  getManufacturerDashboard
);

// Supplier dashboard
router.get(
  "/supplier",
  authenticate,
  requireRegistrationRole("SUPPLIER"),
  getSupplierDashboard
);

export default router;
