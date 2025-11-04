import { Router } from "express";
import { requireRegistrationRole } from "../middleware/roles.js";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  listProducts,
} from "../controllers/productController.js";

const router = Router();
const requireManufacturer = requireRegistrationRole("MANUFACTURER");

router.post("/", requireManufacturer, createProduct);
router.put("/:id", requireManufacturer, updateProduct);
router.delete("/:id", requireManufacturer, deleteProduct);
router.get("/", requireManufacturer, listProducts);
router.get("/:id", requireManufacturer, getProduct);

export default router;
