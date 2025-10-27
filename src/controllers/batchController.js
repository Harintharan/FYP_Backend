import { ZodError } from "zod";
import {
  createBatch,
  updateBatchDetails,
  getBatchDetails,
  listManufacturerBatches,
} from "../services/batchService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function registerBatch(req, res) {
  try {
    const { statusCode, body } = await createBatch({
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
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "GET /api/batches/manufacturer/:manufacturerUuid error",
      fallbackMessage: "Unable to list batches",
    });
  }
}
