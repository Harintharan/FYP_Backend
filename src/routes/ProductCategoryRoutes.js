import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  listProductCategories,
  getProductCategory,
} from "../controllers/ProductCategoryController.js";

const router = Router();
const requireManufacturer = requireRegistrationRole("MANUFACTURER");

router.post("/", requireManufacturer, createProductCategory);
router.put("/:id", requireManufacturer, updateProductCategory);
router.delete("/:id", requireManufacturer, deleteProductCategory);
router.get("/", requireManufacturer, listProductCategories);
router.get("/:id", requireManufacturer, getProductCategory);

export default router;
