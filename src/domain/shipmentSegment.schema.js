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

const optionalOrder = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().min(1, "segmentOrder must be >= 1"))
  .optional();

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
  supplierId: optionalString,
  segmentOrder: optionalOrder,
  status: optionalStatus,
});

export const ShipmentSegmentStatusUpdatePayload = z.object({
  status: z.enum(SHIPMENT_SEGMENT_STATUS_VALUES),
  supplierId: z.string().uuid("supplierId must be a valid UUID").optional(),
});

const toNumber = (value) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return value;
};

const coordinateSchema = (fieldName) =>
  z.preprocess(
    (value) => toNumber(value),
    z
      .number()
      .refine((val) => Number.isFinite(val), `${fieldName} must be a valid number`)
  );

export const ShipmentSegmentHandoverPayload = z.object({
  latitude: coordinateSchema("latitude"),
  longitude: coordinateSchema("longitude"),
});
