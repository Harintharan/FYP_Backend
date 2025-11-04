import {
  registerShipment as registerShipmentService,
  getShipmentDetails,
  updateShipment as updateShipmentService,
  listShipments,
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

export async function getAllShipments(_req, res) {
  try {
    const { statusCode, body } = await listShipments();
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing shipments",
      fallbackMessage: "Unable to list shipments",
    });
  }
}

