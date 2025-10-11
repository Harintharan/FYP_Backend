import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  registerProduct,
  updateProduct,
  getProduct,
  listProductsByManufacturer,
  listProducts,
} from "../controllers/productController.js";

const router = Router();

router.post("/", requireRegistrationRole("MANUFACTURER"), registerProduct);
router.put("/:id", requireRegistrationRole("MANUFACTURER"), updateProduct);
router.get(
  "/manufacturer/:manufacturerUuid",
  requireRegistrationRole("MANUFACTURER"),
  listProductsByManufacturer
);
router.get("/:id", requireRegistrationRole("MANUFACTURER"), getProduct);
router.get("/", requireRegistrationRole("MANUFACTURER"), listProducts);

export default router;
