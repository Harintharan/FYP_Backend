import { z } from "zod";

const trimmed = (field, { min = 1, max = 200 } = {}) =>
  z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a string`,
    })
    .trim()
    .min(min, `${field} must not be empty`)
    .max(max, `${field} must be ${max} characters or fewer`);

const optionalTrimmed = (field, max = 500) =>
  z
    .string({ invalid_type_error: `${field} must be a string` })
    .trim()
    .max(max, `${field} must be ${max} characters or fewer`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const ProductPayload = z.object({
  productName: trimmed("productName", { max: 180 }),
  productCategoryId: z
    .string({
      required_error: "productCategoryId is required",
      invalid_type_error: "productCategoryId must be a string",
    })
    .uuid("productCategoryId must be a valid UUID"),
  requiredStartTemp: optionalTrimmed("requiredStartTemp", 120),
  requiredEndTemp: optionalTrimmed("requiredEndTemp", 120),
  handlingInstructions: optionalTrimmed("handlingInstructions", 2000),
});

export const ProductUpdatePayload = ProductPayload;
