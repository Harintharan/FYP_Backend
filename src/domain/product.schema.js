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

export const ProductPayload = z.object({
  manufacturerUUID: requiredString,
  productName: requiredString,
  productCategory: requiredString,
  batchId: optionalString,
  requiredStorageTemp: optionalString,
  transportRoutePlanId: optionalString,
  handlingInstructions: optionalString,
  expiryDate: optionalString,
  microprocessorMac: optionalString,
  sensorTypes: optionalString,
  wifiSSID: optionalString,
  wifiPassword: optionalString,
  originFacilityAddr: optionalString,
  status: optionalString,
});

export const ProductUpdatePayload = ProductPayload;
