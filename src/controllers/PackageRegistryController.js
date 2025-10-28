import { ZodError } from "zod";
import {
  createPackage,
  updatePackageDetails,
  getPackageDetails,
  listManufacturerPackages,
  deletePackageRecord,
} from "../services/packageRegistryService.js";
import { PACKAGE_STATUS_VALUES } from "../domain/package.schema.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function registerPackage(req, res) {
  try {
    const { statusCode, body } = await createPackage({
      payload: req.body,
      registration: req.registration,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error registering package",
      fallbackMessage: "Unable to register package",
    });
  }
}

export async function updatePackage(req, res) {
  try {
    const { statusCode, body } = await updatePackageDetails({
      id: req.params.id,
      payload: req.body,
      registration: req.registration,
      wallet: req.wallet,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error updating package",
      fallbackMessage: "Unable to update package",
    });
  }
}

export async function getPackage(req, res) {
  try {
    const { statusCode, body } = await getPackageDetails({
      id: req.params.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching package",
      fallbackMessage: "Unable to fetch package",
    });
  }
}

export async function listPackagesByManufacturer(req, res) {
  try {
    const { statusCode, body } = await listManufacturerPackages({
      manufacturerUuid: req.params.manufacturerUuid,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "GET /api/package-registry/manufacturer/:manufacturerUuid error",
      fallbackMessage: "Unable to list packages",
    });
  }
}

export async function listPackages(req, res) {
  try {
    const { statusCode, body } = await listManufacturerPackages({
      manufacturerUuid: req.registration?.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing packages",
      fallbackMessage: "Unable to list packages",
    });
  }
}

export async function listPackageStatuses(_req, res) {
  return res.status(200).json({
    statusCode: 200,
    statuses: PACKAGE_STATUS_VALUES,
  });
}

export async function deletePackage(req, res) {
  try {
    const { statusCode } = await deletePackageRecord({
      id: req.params.id,
      registration: req.registration,
    });
    return res.sendStatus(statusCode);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error deleting package",
      fallbackMessage: "Unable to delete package",
    });
  }
}
