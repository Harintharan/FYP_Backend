import { HttpError } from "../utils/httpError.js";

export const ShipmentErrorCodes = Object.freeze({
  NOT_FOUND: "SHIPMENT_NOT_FOUND",
  HASH_MISMATCH: "SHIPMENT_HASH_MISMATCH",
  VALIDATION_ERROR: "SHIPMENT_VALIDATION_ERROR",
  CONFLICT: "SHIPMENT_CONFLICT",
});

export function shipmentNotFound() {
  return new HttpError(404, "Shipment not found", {
    code: ShipmentErrorCodes.NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(502, "On-chain shipment hash mismatch detected", {
    code: ShipmentErrorCodes.HASH_MISMATCH,
    details,
  });
}

export function shipmentValidationError(message, details) {
  return new HttpError(400, message, {
    code: ShipmentErrorCodes.VALIDATION_ERROR,
    details,
  });
}

export function shipmentConflictError(message, details) {
  return new HttpError(409, message, {
    code: ShipmentErrorCodes.CONFLICT,
    details,
  });
}
