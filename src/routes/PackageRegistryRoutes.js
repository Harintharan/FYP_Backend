import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  registerPackage,
  updatePackage,
  getPackage,
  listPackagesByManufacturer,
  listPackages,
  listPackageStatuses,
} from "../controllers/PackageRegistryController.js";

const router = Router();

router.post("/", requireRegistrationRole("MANUFACTURER"), registerPackage);
router.put("/:id", requireRegistrationRole("MANUFACTURER"), updatePackage);
router.get(
  "/manufacturer/:manufacturerUuid",
  requireRegistrationRole("MANUFACTURER"),
  listPackagesByManufacturer
);
router.get(
  "/statuses",
  requireRegistrationRole("MANUFACTURER"),
  listPackageStatuses
);
router.get("/:id", requireRegistrationRole("MANUFACTURER"), getPackage);
router.get("/", requireRegistrationRole("MANUFACTURER"), listPackages);

export default router;
