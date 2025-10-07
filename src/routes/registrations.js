import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/roles.js";
import {
  createRegistration,
  updateRegistrationById,
  listPendingRegistrations,
  listApprovedRegistrations,
  getRegistrationById,
  approveRegistrationById,
  rejectRegistrationById,
} from "../controllers/registrationController.js";

const router = Router();

router.post("/", requireAuth, createRegistration);
router.put("/:id", requireAuth, updateRegistrationById);
router.get("/pending", requireRole("ADMIN"), listPendingRegistrations);
router.get("/approved", requireRole("ADMIN"), listApprovedRegistrations);
router.get("/:id", getRegistrationById);
router.patch(
  "/:id/approve",
  requireRole("ADMIN"),
  approveRegistrationById
);
router.patch(
  "/:id/reject",
  requireRole("ADMIN"),
  rejectRegistrationById
);

export default router;
