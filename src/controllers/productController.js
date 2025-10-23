import { ZodError } from "zod";
import {
  createProduct,
  updateProductDetails,
  getProductDetails,
  listManufacturerProducts,
} from "../services/productService.js";
import {
  respondWithZodError,
  handleControllerError,
} from "./helpers/errorResponse.js";
import {
  summarizeFalsification,
  DEFAULT_HASH_BITS,
} from "../services/falsificationAnalysis.js";
import { buildProductIntegrityMatrix } from "../services/productIntegrityMatrix.js";
import { listProductsByManufacturerUuid } from "../models/ProductRegistryModel.js";

export async function registerProduct(req, res) {
  try {
    const { statusCode, body } = await createProduct({
      payload: req.body,
      registration: req.registration,
      wallet: req.wallet,
    });
    const security = summarizeFalsification({ b: DEFAULT_HASH_BITS, N: 1 });
    return res.status(statusCode).json({ ...body, security });
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
    if (String(req.query.integrityMatrix).toLowerCase() === "true") {
      const rows = await listProductsByManufacturerUuid(req.params.manufacturerUuid);
      const integrityMatrix = await buildProductIntegrityMatrix(rows);
      const security = summarizeFalsification({ b: DEFAULT_HASH_BITS, N: 1 });
      return res.status(statusCode).json({ items: body, integrityMatrix, security });
    }
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
    if (String(req.query.integrityMatrix).toLowerCase() === "true") {
      const rows = await listProductsByManufacturerUuid(req.registration?.id);
      const integrityMatrix = await buildProductIntegrityMatrix(rows);
      const security = summarizeFalsification({ b: DEFAULT_HASH_BITS, N: 1 });
      return res.status(statusCode).json({ items: body, integrityMatrix, security });
    }
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing products",
      fallbackMessage: "Unable to list products",
    });
  }
}
