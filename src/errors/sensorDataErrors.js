import { HttpError } from "../utils/httpError.js";

export const SensorDataErrorCodes = Object.freeze({
  VALIDATION_ERROR: "SENSOR_DATA_VALIDATION_ERROR",
  NOT_FOUND: "SENSOR_DATA_NOT_FOUND",
});

export function sensorDataValidationError(message, details) {
  return new HttpError(400, message ?? "Sensor data validation failed", {
    code: SensorDataErrorCodes.VALIDATION_ERROR,
    details,
  });
}

export function sensorDataNotFound() {
  return new HttpError(404, "Sensor data not found", {
    code: SensorDataErrorCodes.NOT_FOUND,
  });
}
