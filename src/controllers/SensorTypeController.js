import { ZodError } from "zod";
import {
  createSensorTypeRecord,
  updateSensorTypeRecord,
  deleteSensorTypeRecord,
  listSensorTypes,
  getSensorTypeRecord,
} from "../services/sensorTypeService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function createSensorType(req, res) {
  try {
    const { statusCode, body } = await createSensorTypeRecord({
      payload: req.body,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error creating sensor type",
      fallbackMessage: "Unable to create sensor type",
    });
  }
}

export async function updateSensorType(req, res) {
  try {
    const { statusCode, body } = await updateSensorTypeRecord({
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
      logMessage: "Error updating sensor type",
      fallbackMessage: "Unable to update sensor type",
    });
  }
}

export async function deleteSensorType(req, res) {
  try {
    const { statusCode } = await deleteSensorTypeRecord({
      id: req.params.id,
      registration: req.registration,
    });
    return res.sendStatus(statusCode);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error deleting sensor type",
      fallbackMessage: "Unable to delete sensor type",
    });
  }
}

export async function listSensorTypeRecords(req, res) {
  try {
    const { statusCode, body } = await listSensorTypes({
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing sensor types",
      fallbackMessage: "Unable to list sensor types",
    });
  }
}

export async function getSensorType(req, res) {
  try {
    const { statusCode, body } = await getSensorTypeRecord({
      id: req.params.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching sensor type",
      fallbackMessage: "Unable to fetch sensor type",
    });
  }
}
