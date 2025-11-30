import {
  registerShipment as registerShipmentService,
  getShipmentDetails,
  updateShipment as updateShipmentService,
  listShipments,
  listManufacturerShipments,
  listManufacturerShipmentProductSummary,
} from "../services/shipmentService.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function registerShipment(req, res) {
  try {
    const { statusCode, body } = await registerShipmentService({
      payload: req.body ?? {},
      wallet: req.wallet ?? null,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error registering shipment",
      fallbackMessage: "Unable to register shipment",
    });
  }
}

export async function getShipment(req, res) {
  try {
    const { statusCode, body } = await getShipmentDetails({
      id: req.params.id ?? req.params.shipment_id ?? null,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching shipment",
      fallbackMessage: "Unable to fetch shipment",
    });
  }
}

export async function updateShipment(req, res) {
  try {
    const { statusCode, body } = await updateShipmentService({
      id: req.params.id ?? req.params.shipment_id ?? null,
      payload: req.body ?? {},
      wallet: req.wallet ?? null,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error updating shipment",
      fallbackMessage: "Unable to update shipment",
    });
  }
}

export async function getManufacturerShipments(req, res) {
  try {
    const manufacturerId =
      req.params.manufacturerId ??
      req.params.manufacturer_id ??
      req.params.id ??
      null;

    const { statusCode, body } = await listManufacturerShipments({
      manufacturerId,
      status: req.query?.status ?? null,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing manufacturer shipments",
      fallbackMessage: "Unable to list manufacturer shipments",
    });
  }
}

export async function getManufacturerShipmentProductSummary(req, res) {
  try {
    const manufacturerId =
      req.params.manufacturerId ??
      req.params.manufacturer_id ??
      req.params.id ??
      null;

    const { statusCode, body } = await listManufacturerShipmentProductSummary({
      manufacturerId,
      status: req.query?.status ?? null,
    });

    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing manufacturer shipment product summary",
      fallbackMessage: "Unable to list manufacturer shipment product summary",
    });
  }
}

export async function getAllShipments(req, res) {
  try {
    const manufacturerUUID = req.query?.manufacturerUUID;
    const status = req.query?.status;
    const cursor = req.query?.cursor;
    const limit = req.query?.limit ? parseInt(req.query.limit, 10) : undefined;

    const { statusCode, body } = await listShipments({
      manufacturerUUID,
      status,
      cursor,
      limit,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing shipments",
      fallbackMessage: "Unable to list shipments",
    });
  }
}
