import { HttpError } from "../utils/httpError.js";

export const PackageErrorCodes = Object.freeze({
  REGISTRATION_REQUIRED: "PACKAGE_REGISTRATION_REQUIRED",
  MANUFACTURER_FORBIDDEN: "PACKAGE_MANUFACTURER_FORBIDDEN",
  MANUFACTURER_MISMATCH: "PACKAGE_MANUFACTURER_MISMATCH",
  MANUFACTURER_IMMUTABLE: "PACKAGE_MANUFACTURER_IMMUTABLE",
  NOT_FOUND: "PACKAGE_NOT_FOUND",
  HASH_MISMATCH: "PACKAGE_HASH_MISMATCH",
});

export function registrationRequired() {
  return new HttpError(403, "Manufacturer registration is required", {
    code: PackageErrorCodes.REGISTRATION_REQUIRED,
  });
}

export function manufacturerMismatch() {
  return new HttpError(
    403,
    "manufacturerUUID does not match authenticated manufacturer",
    { code: PackageErrorCodes.MANUFACTURER_MISMATCH }
  );
}

export function manufacturerForbidden() {
  return new HttpError(
    403,
    "Cannot operate on packages for other manufacturers",
    { code: PackageErrorCodes.MANUFACTURER_FORBIDDEN }
  );
}

export function manufacturerImmutable() {
  return new HttpError(400, "manufacturerUUID cannot be changed", {
    code: PackageErrorCodes.MANUFACTURER_IMMUTABLE,
  });
}

export function packageNotFound() {
  return new HttpError(404, "Package not found", {
    code: PackageErrorCodes.NOT_FOUND,
  });
}

export function hashMismatch(details) {
  return new HttpError(502, "On-chain package hash mismatch detected", {
    code: PackageErrorCodes.HASH_MISMATCH,
    details,
  });
}
