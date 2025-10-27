import { ZodError } from "zod";
import {
  createProduct,
  updateProductDetails,
  getProductDetails,
  listManufacturerProducts,
} from "../services/productService.js";
import { PRODUCT_STATUS_VALUES } from "../domain/product.schema.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function registerProduct(req, res) {
  try {
    const { statusCode, body } = await createProduct({
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
      logMessage: "Error registering product",
      fallbackMessage: "Unable to register product",
    });
  }
}

export async function updateProduct(req, res) {
  try {
    const { statusCode, body } = await updateProductDetails({
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

export async function listProductsByManufacturer(req, res) {
  try {
    const { statusCode, body } = await listManufacturerProducts({
      manufacturerUuid: req.params.manufacturerUuid,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "GET /api/products/manufacturer/:manufacturerUuid error",
      fallbackMessage: "Unable to list products",
    });
  }
}

export async function listProducts(req, res) {
  try {
    const { statusCode, body } = await listManufacturerProducts({
      manufacturerUuid: req.registration?.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing products",
      fallbackMessage: "Unable to list products",
    });
  }
}

export async function listProductStatuses(_req, res) {
  return res.status(200).json({
    statusCode: 200,
    statuses: PRODUCT_STATUS_VALUES,
  });
}
