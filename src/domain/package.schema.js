import { z } from "zod";

const toTrimmedString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const str = typeof value === "string" ? value : String(value);
  return str.trim();
};

const requiredString = z.preprocess((value) => {
  const trimmed = toTrimmedString(value);
  return trimmed ?? value;
}, z.string().min(1, "Value is required"));

const optionalString = z
  .preprocess((value) => {
    const trimmed = toTrimmedString(value);
    return trimmed === "" ? undefined : trimmed;
  }, z.string().min(1))
  .optional();

const optionalUuid = z.preprocess((value) => {
  const trimmed = toTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}, z.string().uuid().optional());

const optionalQuantity = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const trimmed = toTrimmedString(value);
    if (trimmed === undefined || trimmed === "") {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().min(0, "quantity must be a non-negative integer"))
  .optional();

export const PACKAGE_STATUS_VALUES = Object.freeze([
  "PACKAGE_READY_FOR_SHIPMENT",
  "PACKAGE_ALLOCATED",
  "PACKAGE_IN_TRANSIT",
  "PACKAGE_DELIVERED",
  "PACKAGE_RETURNED",
  "PACKAGE_CANCELLED",
]);

const optionalStatus = z
  .preprocess((value) => {
    const trimmed = toTrimmedString(value);
    return trimmed === "" ? undefined : trimmed;
  }, z.enum(PACKAGE_STATUS_VALUES))
  .optional();

export const PackagePayload = z.object({
  manufacturerUUID: requiredString,
  productName: requiredString,
  productCategory: requiredString,
  batchId: optionalString,
  shipmentId: optionalUuid,
  quantity: optionalQuantity,
  microprocessorMac: optionalString,
  sensorTypes: optionalString,
  wifiSSID: optionalString,
  wifiPassword: optionalString,
  status: optionalStatus,
});

export const PackageUpdatePayload = PackagePayload;
