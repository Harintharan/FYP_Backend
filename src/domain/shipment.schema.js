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

const requiredString = z.preprocess((value) => {
  const trimmed = toTrimmedString(value);
  return trimmed ?? value;
}, z.string().min(1, "Value is required"));

const optionalQuantity = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const trimmed = toTrimmedString(value);
    if (trimmed === undefined) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().min(0, "quantity must be a non-negative integer"))
  .optional();

const optionalSegmentOrder = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const trimmed = toTrimmedString(value);
    if (trimmed === undefined) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().min(1, "segmentOrder must be a positive integer"))
  .optional();

export const ShipmentPayload = z.object({
  manufacturerUUID: requiredUuid,
  consumerUUID: requiredUuid,
});

export const ShipmentItemPayload = z.object({
  productUUID: requiredUuid,
  quantity: optionalQuantity,
});

export const ShipmentCheckpointPayload = z.object({
  startCheckpointId: requiredUuid,
  endCheckpointId: requiredUuid,
  expectedShipDate: requiredString,
  estimatedArrivalDate: requiredString,
  timeTolerance: requiredString,
  segmentOrder: optionalSegmentOrder,
});
