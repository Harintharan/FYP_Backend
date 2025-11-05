import { ZodError } from "zod";
import {
  listShipmentSegmentsForShipment,
  listPendingShipmentSegmentsWithDetails,
  updateShipmentSegmentStatus,
  getShipmentSegmentPackageDetails,
  acceptShipmentSegment,
  takeoverShipmentSegment,
} from "../services/shipmentSegmentService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";
import { httpError } from "../utils/httpError.js";
import { ErrorCodes } from "../errors/errorCodes.js";
import { ShipmentSegmentStatusUpdatePayload } from "../domain/shipmentSegment.schema.js";

export async function listShipmentSegments(req, res) {
  try {
    const shipmentId = req.params.id;
    if (!shipmentId) {
      throw httpError(400, "Shipment id is required", {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const segments = await listShipmentSegmentsForShipment(shipmentId);
    return res.status(200).json(segments);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing shipment segments",
      fallbackMessage: "Unable to list shipment segments",
    });
  }
}

export async function updateShipmentSegmentStatusById(req, res) {
  try {
    const segmentId = req.params.id;
    if (!segmentId) {
      throw httpError(400, "Segment id is required", {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const parsed = ShipmentSegmentStatusUpdatePayload.parse(req.body ?? {});
    const updated = await updateShipmentSegmentStatus({
      segmentId,
      status: parsed.status,
      supplierId: parsed.supplierId ?? null,
      walletAddress: req.wallet?.walletAddress ?? null,
    });
    return res.status(200).json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error updating shipment segment status",
      fallbackMessage: "Unable to update shipment segment status",
    });
  }
}

export async function listPendingShipmentSegments(_req, res) {
  try {
    const segments = await listPendingShipmentSegmentsWithDetails();
    return res.status(200).json(segments);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing pending shipment segments",
      fallbackMessage: "Unable to list pending shipment segments",
    });
  }
}

export async function acceptShipmentSegmentBySupplier(req, res) {
  try {
    const segmentId = req.params.id;
    if (!segmentId) {
      throw httpError(400, "Segment id is required", {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const updated = await acceptShipmentSegment({
      segmentId,
      registration: req.registration,
      walletAddress: req.wallet?.walletAddress ?? null,
    });

    return res.status(200).json(updated);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error accepting shipment segment",
      fallbackMessage: "Unable to accept shipment segment",
    });
  }
}

export async function takeoverShipmentSegmentBySupplier(req, res) {
  try {
    const segmentId = req.params.id;
    if (!segmentId) {
      throw httpError(400, "Segment id is required", {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const registration = req.registration ?? null;
    if (!registration?.id) {
      throw httpError(403, "Supplier registration is required", {
        code: ErrorCodes.FORBIDDEN,
      });
    }

    const updated = await takeoverShipmentSegment({
      segmentId,
      registration,
      walletAddress: req.wallet?.walletAddress ?? null,
    });

    return res.status(200).json(updated);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error taking over shipment segment",
      fallbackMessage: "Unable to take over shipment segment",
    });
  }
}

export async function getShipmentSegmentPackages(req, res) {
  try {
    const segmentId = req.params.id;
    if (!segmentId) {
      throw httpError(400, "Segment id is required", {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const details = await getShipmentSegmentPackageDetails({
      segmentId,
      registration: req.registration,
    });
    return res.status(200).json(details);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching shipment segment package details",
      fallbackMessage: "Unable to fetch shipment segment package details",
    });
  }
}
