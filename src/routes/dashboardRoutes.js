import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireRegistrationRole } from "../middleware/roles.js";
import { getManufacturerDashboard } from "../controllers/dashboardController.js";

const router = Router();

// Manufacturer dashboard
router.get(
  "/manufacturer",
  authenticate,
  requireRegistrationRole("MANUFACTURER"),
  getManufacturerDashboard
);

export default router;
