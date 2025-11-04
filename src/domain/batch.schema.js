import { z } from "zod";

const requiredString = (field) =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`);

const uuidString = (field) =>
  z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a string`,
    })
    .trim()
    .uuid(`${field} must be a valid UUID`);

const optionalString = (field) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null) {
        return undefined;
      }
      const str = typeof value === "string" ? value : String(value);
      const trimmed = str.trim();
      return trimmed === "" ? undefined : trimmed;
    }, z.string().min(1, `${field} cannot be empty`))
    .optional();

const optionalTimestamp = (field) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null || value === "") {
        return undefined;
      }
      const str = typeof value === "string" ? value.trim() : String(value).trim();
      if (!str) {
        return undefined;
      }
      const date = new Date(str);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${field} must be a valid ISO 8601 timestamp`);
      }
      return date.toISOString();
    }, z.string())
    .optional();

const quantitySchema = z
  .union([
    z
      .number({
        required_error: "quantityProduced is required",
        invalid_type_error: "quantityProduced must be a number or string",
      })
      .nonnegative("quantityProduced must be non-negative"),
    z
      .string({
        required_error: "quantityProduced is required",
      })
      .trim()
      .min(1, "quantityProduced is required"),
  ])
  .transform((value) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error("quantityProduced must be a finite number");
      }
      return value.toString();
    }
    return value;
  })
  .refine((value) => value.trim().length > 0, {
    message: "quantityProduced is required",
  });

export const BatchPayload = z.object({
  productId: uuidString("productId"),
  manufacturerUUID: uuidString("manufacturerUUID"),
  facility: requiredString("facility"),
  productionStartTime: optionalTimestamp("productionStartTime"),
  productionEndTime: optionalTimestamp("productionEndTime"),
  quantityProduced: quantitySchema,
  expiryDate: optionalString("expiryDate"),
});
