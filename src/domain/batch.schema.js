import { z } from "zod";

const requiredString = (field) =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`);

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
  productCategory: requiredString("productCategory"),
  manufacturerUUID: z
    .string({
      required_error: "manufacturerUUID is required",
      invalid_type_error: "manufacturerUUID must be a string",
    })
    .trim()
    .uuid("manufacturerUUID must be a valid UUID"),
  facility: requiredString("facility"),
  productionWindow: requiredString("productionWindow"),
  quantityProduced: quantitySchema,
  releaseStatus: requiredString("releaseStatus"),
  expiryDate: optionalString("expiryDate"),
  handlingInstructions: optionalString("handlingInstructions"),
  requiredStartTemp: optionalString("requiredStartTemp"),
  requiredEndTemp: optionalString("requiredEndTemp"),
});
