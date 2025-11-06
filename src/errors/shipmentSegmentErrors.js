import { HttpError } from "../utils/httpError.js";

export const ShipmentSegmentErrorCodes = Object.freeze({
  NOT_FOUND: "SHIPMENT_SEGMENT_NOT_FOUND",
  HASH_MISMATCH: "SHIPMENT_SEGMENT_HASH_MISMATCH",
  CONFLICT: "SHIPMENT_SEGMENT_CONFLICT",
  ACCESS_DENIED: "SHIPMENT_SEGMENT_ACCESS_DENIED",
});

export function shipmentSegmentNotFound() {
  return new HttpError(404, "Shipment segment not found", {
    code: ShipmentSegmentErrorCodes.NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(
    502,
    "On-chain shipment segment hash mismatch detected",
    {
      code: ShipmentSegmentErrorCodes.HASH_MISMATCH,
      details,
    }
  );
}

export function shipmentSegmentConflict(message) {
  return new HttpError(409, message ?? "Shipment segment conflict", {
    code: ShipmentSegmentErrorCodes.CONFLICT,
  });
}

export function shipmentSegmentAccessDenied(message) {
  return new HttpError(403, message ?? "Access denied", {
    code: ShipmentSegmentErrorCodes.ACCESS_DENIED,
  });
}
