import { HttpError } from "../utils/httpError.js";

export const ProductCategoryErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "CATEGORY_REGISTRATION_REQUIRED",
  ALREADY_EXISTS: "CATEGORY_ALREADY_EXISTS",
  NOT_FOUND: "CATEGORY_NOT_FOUND",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: ProductCategoryErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function categoryAlreadyExists(name) {
  return new HttpError(409, `Product category '${name}' already exists`, {
    code: ProductCategoryErrorCodes.ALREADY_EXISTS,
  });
}

export function categoryNotFound() {
  return new HttpError(404, "Product category not found", {
    code: ProductCategoryErrorCodes.NOT_FOUND,
  });
}
