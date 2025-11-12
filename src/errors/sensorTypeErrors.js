import { HttpError } from "../utils/httpError.js";

export const SensorTypeErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "SENSOR_TYPE_REGISTRATION_REQUIRED",
  FORBIDDEN: "SENSOR_TYPE_FORBIDDEN",
  ALREADY_EXISTS: "SENSOR_TYPE_ALREADY_EXISTS",
  NOT_FOUND: "SENSOR_TYPE_NOT_FOUND",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: SensorTypeErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function sensorTypeForbidden() {
  return new HttpError(403, "You are not allowed to access this sensor type", {
    code: SensorTypeErrorCodes.FORBIDDEN,
  });
}

export function sensorTypeAlreadyExists(name) {
  return new HttpError(409, `Sensor type '${name}' already exists`, {
    code: SensorTypeErrorCodes.ALREADY_EXISTS,
  });
}

export function sensorTypeNotFound() {
  return new HttpError(404, "Sensor type not found", {
    code: SensorTypeErrorCodes.NOT_FOUND,
  });
}
