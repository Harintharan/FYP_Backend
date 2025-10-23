import { z } from "zod";

const toTrimmedString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const requiredUuid = z.preprocess((value) => {
  const trimmed = toTrimmedString(value);
  return trimmed ?? value;
}, z.string().uuid("Value must be a valid UUID"));

const optionalString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  });

export const SHIPMENT_SEGMENT_STATUS_VALUES = Object.freeze([
  "PENDING",
  "ACCEPTED",
  "IN_TRANSIT",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
]);

const optionalStatus = z
  .preprocess((value) => {
    const trimmed = toTrimmedString(value);
    return trimmed ? trimmed.toUpperCase() : undefined;
  }, z.enum(SHIPMENT_SEGMENT_STATUS_VALUES))
  .optional();

export const ShipmentSegmentPayload = z.object({
  shipmentId: requiredUuid,
  startCheckpointId: requiredUuid,
  endCheckpointId: requiredUuid,
  expectedShipDate: optionalString,
  estimatedArrivalDate: optionalString,
  timeTolerance: optionalString,
  fromUserId: optionalString,
  toUserId: optionalString,
  status: optionalStatus,
});
