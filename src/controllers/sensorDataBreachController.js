import { ZodError } from "zod";
import {
  createSensorDataBreachEntry,
  listSensorDataBreaches,
  getSensorDataBreach,
} from "../services/sensorDataBreachService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function createSensorDataBreach(req, res) {
  try {
    const { statusCode, body } = await createSensorDataBreachEntry({
      payload: req.body,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error creating sensor data breach",
      fallbackMessage: "Unable to create sensor data breach",
    });
  }
}

export async function listBreachesBySensorData(req, res) {
  try {
    const { statusCode, body } = await listSensorDataBreaches({
      sensorDataId: req.params.sensorDataId,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error listing sensor data breaches",
      fallbackMessage: "Unable to list sensor data breaches",
    });
  }
}

export async function getSensorDataBreachEntry(req, res) {
  try {
    const { statusCode, body } = await getSensorDataBreach({
      id: req.params.id,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching sensor data breach",
      fallbackMessage: "Unable to fetch sensor data breach",
    });
  }
}
