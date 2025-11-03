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
  .preprocess((value) => toTrimmedString(value) ?? value, z.string().min(1))
  .optional();

const optionalTimestamp = z
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

export const SensorDataBreachPayload = z.object({
  sensorDataId: requiredUuid,
  sensorType: z.preprocess((value) => toTrimmedString(value) ?? value, z.string().min(1)),
  reading: optionalString,
  note: optionalString,
  detectedAt: optionalTimestamp,
});

export const SensorDataBreachQuery = z.object({
  sensorDataId: requiredUuid,
});
