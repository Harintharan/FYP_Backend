import { ZodError } from "zod";
import {
  createProductRecord,
  updateProductRecord,
  deleteProductRecord,
  getProductDetails,
  listProductsByOwner,
} from "../services/productService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function createProduct(req, res) {
  try {
    const { statusCode, body } = await createProductRecord({
      payload: req.body,
      registration: req.registration,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error creating product",
      fallbackMessage: "Unable to create product",
    });
  }
}

export async function updateProduct(req, res) {
  try {
    const { statusCode, body } = await updateProductRecord({
      id: req.params.id,
      payload: req.body,
      registration: req.registration,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error updating product",
      fallbackMessage: "Unable to update product",
    });
  }
}

export async function deleteProduct(req, res) {
  try {
    const { statusCode } = await deleteProductRecord({
      id: req.params.id,
      registration: req.registration,
    });
    return res.sendStatus(statusCode);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error deleting product",
      fallbackMessage: "Unable to delete product",
    });
  }
}

export async function getProduct(req, res) {
  try {
    const { statusCode, body } = await getProductDetails({
      id: req.params.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching product",
      fallbackMessage: "Unable to fetch product",
    });
  }
}

export async function listProducts(req, res) {
  try {
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;

    const { statusCode, body } = await listProductsByOwner({
      registration: req.registration,
      categoryId,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing products",
      fallbackMessage: "Unable to list products",
    });
  }
}
