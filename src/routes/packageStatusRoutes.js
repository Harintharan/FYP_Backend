import express from "express";
import { getPackageStatusWithBreaches } from "../controllers/packageStatusController.js";
import { requireAuth } from "../middleware/roles.js";

const router = express.Router();

/**
 * @route GET /api/package-status/:packageId
 * @desc Get complete package status including shipment chain and breaches
 * @access Private
 */
router.get("/:packageId", requireAuth, getPackageStatusWithBreaches);

export default router;
