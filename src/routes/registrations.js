import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/roles.js";
import {
  createRegistration,
  updateRegistrationByClient,
  listPendingRegistrations,
  listApprovedRegistrations,
  getRegistrationByClient,
  approveRegistrationByClient,
  rejectRegistrationByClient,
} from "../controllers/registrationController.js";

const router = Router();

router.post("/", requireAuth, createRegistration);
router.put("/:clientUuid", requireAuth, updateRegistrationByClient);
router.get("/pending", requireRole("ADMIN"),listPendingRegistrations);
router.get("/approved", requireRole("ADMIN"), listApprovedRegistrations);
router.get("/:clientUuid", getRegistrationByClient);
router.patch(
  "/:clientUuid/approve",
  requireRole("ADMIN"),
  approveRegistrationByClient
);
router.patch(
  "/:clientUuid/reject",
  requireRole("ADMIN"),
  rejectRegistrationByClient
);

export default router;
