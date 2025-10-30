import { z } from "zod";

const toTrimmedString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const optionalString = z
  .preprocess((value) => toTrimmedString(value) ?? value, z.string().min(1))
  .optional();

const requiredUuid = z.preprocess((value) => {
  const trimmed = toTrimmedString(value);
  return trimmed ?? value;
}, z.string().uuid("Value must be a valid UUID"));

const timestampInput = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === "number") {
      return value;
    }
    const trimmed = toTrimmedString(value);
    return trimmed ?? value;
  }, z.union([z.number(), z.string(), z.date()]))
  .optional();

const SensorReadingPayload = z.object({
  sensorType: z.preprocess(
    (value) => toTrimmedString(value) ?? value,
    z.string().min(1, "sensorType is required")
  ),
  data: z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }
      return String(value);
    },
    z.string().min(1, "data is required")
  ),
  timestamp: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") {
        return undefined;
      }
      if (value instanceof Date) {
        return value;
      }
      if (typeof value === "number") {
        return value;
      }
      const trimmed = toTrimmedString(value);
      return trimmed ?? value;
    },
    z.union([z.number(), z.string(), z.date()])
  ),
});

export const SensorDataPayload = z.object({
  packageId: requiredUuid,
  macAddress: optionalString,
  ipAddress: optionalString,
  requestSendTimeStamp: timestampInput,
  sensorData: z
    .array(SensorReadingPayload)
    .min(1, "sensorData must contain at least one entry"),
});

export const SensorDataQuery = z.object({
  packageId: requiredUuid,
});
