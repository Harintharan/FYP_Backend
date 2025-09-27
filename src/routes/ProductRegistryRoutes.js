import { Router } from "express";
import {
  registerProduct,
  updateProduct,
  getProduct,
  getAllProducts,
} from "../controllers/ProductRegistryController.js";

const router = Router();

router.post("/", registerProduct);
router.put("/:product_id", updateProduct);
router.get("/:product_id", getProduct);
router.get("/", getAllProducts);

export default router;
