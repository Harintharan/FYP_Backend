import { ZodError } from "zod";
import {
  createProductCategoryRecord,
  updateProductCategoryRecord,
  deleteProductCategoryRecord,
  listAllProductCategories,
  getProductCategoryRecord,
} from "../services/productCategoryService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function createProductCategory(req, res) {
  try {
    const { statusCode, body } = await createProductCategoryRecord({
      payload: req.body,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error creating product category",
      fallbackMessage: "Unable to create product category",
    });
  }
}

export async function updateProductCategory(req, res) {
  try {
    const { statusCode, body } = await updateProductCategoryRecord({
      id: req.params.id,
      payload: req.body,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error updating product category",
      fallbackMessage: "Unable to update product category",
    });
  }
}

export async function deleteProductCategory(req, res) {
  try {
    const { statusCode } = await deleteProductCategoryRecord({
      id: req.params.id,
      registration: req.registration,
    });
    return res.sendStatus(statusCode);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error deleting product category",
      fallbackMessage: "Unable to delete product category",
    });
  }
}

export async function listProductCategories(_req, res) {
  try {
    const { statusCode, body } = await listAllProductCategories();
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing product categories",
      fallbackMessage: "Unable to list product categories",
    });
  }
}

export async function getProductCategory(req, res) {
  try {
    const { statusCode, body } = await getProductCategoryRecord({
      id: req.params.id,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching product category",
      fallbackMessage: "Unable to fetch product category",
    });
  }
}
