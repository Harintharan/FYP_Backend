import { HttpError } from "../utils/httpError.js";

export const ProductErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "PRODUCT_REGISTRATION_REQUIRED",
  CATEGORY_NOT_FOUND: "PRODUCT_CATEGORY_NOT_FOUND",
  FORBIDDEN: "PRODUCT_FORBIDDEN",
  NOT_FOUND: "PRODUCT_NOT_FOUND",
  HASH_MISMATCH: "PRODUCT_HASH_MISMATCH",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: ProductErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function productCategoryNotFound() {
  return new HttpError(404, "Product category not found", {
    code: ProductErrorCodes.CATEGORY_NOT_FOUND,
  });
}

export function productForbidden() {
  return new HttpError(403, "You do not have access to this product", {
    code: ProductErrorCodes.FORBIDDEN,
  });
}

export function productNotFound() {
  return new HttpError(404, "Product not found", {
    code: ProductErrorCodes.NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(502, "On-chain product hash mismatch detected", {
    code: ProductErrorCodes.HASH_MISMATCH,
    details,
  });
}
