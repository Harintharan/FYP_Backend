import { HttpError } from "../utils/httpError.js";

export const ProductErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "PRODUCT_REGISTRATION_REQUIRED",
  MANUFACTURER_FORBIDDEN: "PRODUCT_MANUFACTURER_FORBIDDEN",
  MANUFACTURER_MISMATCH: "PRODUCT_MANUFACTURER_MISMATCH",
  MANUFACTURER_IMMUTABLE: "PRODUCT_MANUFACTURER_IMMUTABLE",
  NOT_FOUND: "PRODUCT_NOT_FOUND",
  HASH_MISMATCH: "PRODUCT_HASH_MISMATCH",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: ProductErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function manufacturerMismatch() {
  return new HttpError(
    403,
    "manufacturerUUID does not match authenticated manufacturer",
    { code: ProductErrorCodes.MANUFACTURER_MISMATCH }
  );
}

export function manufacturerForbidden() {
  return new HttpError(
    403,
    "Cannot operate on products for other manufacturers",
    { code: ProductErrorCodes.MANUFACTURER_FORBIDDEN }
  );
}

export function manufacturerImmutable() {
  return new HttpError(400, "manufacturerUUID cannot be changed", {
    code: ProductErrorCodes.MANUFACTURER_IMMUTABLE,
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
