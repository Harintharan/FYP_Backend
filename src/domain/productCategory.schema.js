import { z } from "zod";

const trimmedString = z
  .string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a string",
  })
  .trim()
  .min(1, "Name must not be empty")
  .max(120, "Name must be 120 characters or fewer");

export const ProductCategoryPayload = z.object({
  name: trimmedString,
});
