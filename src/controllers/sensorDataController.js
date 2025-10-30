import { ZodError } from "zod";
import {
  createSensorDataEntry,
  listSensorDataEntries,
  getSensorDataEntry,
} from "../services/sensorDataService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function createSensorData(req, res) {
  try {
    const { statusCode, body } = await createSensorDataEntry({
      payload: req.body,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error creating sensor data entry",
      fallbackMessage: "Unable to create sensor data entry",
    });
  }
}

export async function listSensorDataByPackage(req, res) {
  try {
    const { statusCode, body } = await listSensorDataEntries({
      packageId: req.params.packageId,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing sensor data entries",
      fallbackMessage: "Unable to list sensor data entries",
    });
  }
}

export async function getSensorData(req, res) {
  try {
    const { statusCode, body } = await getSensorDataEntry({
      id: req.params.id,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching sensor data entry",
      fallbackMessage: "Unable to fetch sensor data entry",
    });
  }
}
