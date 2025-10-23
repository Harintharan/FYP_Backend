import { z } from "zod";

const toTrimmed = (value) => {
  if (value == null) {
    return undefined;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const requiredString = z.preprocess(
  toTrimmed,
  z.string().min(1, "Value is required")
);
const optionalString = z.preprocess(toTrimmed, z.string().min(1)).optional();
const ownerUuidString = z.preprocess(
  toTrimmed,
  z
    .string({ required_error: "ownerUUID is required" })
    .uuid("ownerUUID must be a valid UUID")
    .transform((value) => value.toLowerCase())
);

export const CheckpointPayload = z.object({
  name: requiredString,
  address: optionalString,
  latitude: optionalString,
  longitude: optionalString,
  state: requiredString,
  country: requiredString,
  ownerUUID: ownerUuidString,
});

export const CheckpointUpdatePayload = CheckpointPayload;
