import { ZodError } from "zod";
import {
  createBatch,
  updateBatchDetails,
  getBatchDetails,
  listManufacturerBatches,
} from "../services/batchService.js";
import {
  respondWithZodError,
  handleControllerError,
} from "./helpers/errorResponse.js";
import {
  summarizeFalsification,
  DEFAULT_HASH_BITS,
} from "../services/falsificationAnalysis.js";
import { buildBatchIntegrityMatrix } from "../services/batchIntegrityMatrix.js";
import { listBatchesByManufacturerUuid as listBatchesRaw } from "../models/batchModel.js";

export async function registerBatch(req, res) {
  try {
    const { statusCode, body } = await createBatch({
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
      logMessage: "Error registering batch",
      fallbackMessage: "Unable to register batch",
    });
  }
}

export async function updateBatch(req, res) {
  try {
    const { statusCode, body } = await updateBatchDetails({
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
      logMessage: "Error updating batch",
      fallbackMessage: "Unable to update batch",
    });
  }
}

export async function getBatch(req, res) {
  try {
    const { statusCode, body } = await getBatchDetails({
      id: req.params.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching batch",
      fallbackMessage: "Unable to fetch batch",
    });
  }
}

export async function listBatchesByManufacturer(req, res) {
  try {
    const { statusCode, body } = await listManufacturerBatches({
      manufacturerUuid: req.params.manufacturerUuid,
      registration: req.registration,
    });
    if (String(req.query.integrityMatrix).toLowerCase() === "true") {
      const rows = await listBatchesRaw(req.params.manufacturerUuid);
      const integrityMatrix = await buildBatchIntegrityMatrix(rows);
      const security = summarizeFalsification({ b: DEFAULT_HASH_BITS, N: 1 });
      return res.status(statusCode).json({ items: body, integrityMatrix, security });
    }
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "GET /api/batches/manufacturer/:manufacturerUuid error",
      fallbackMessage: "Unable to list batches",
    });
  }
}
