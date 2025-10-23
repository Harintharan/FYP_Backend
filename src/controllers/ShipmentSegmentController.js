import { ZodError, z } from "zod";
import {
  listShipmentSegmentsForShipment,
  updateShipmentSegmentStatus,
} from "../services/shipmentSegmentService.js";
import { respondWithRegistrationError } from "../middleware/registrationErrorMiddleware.js";
import { isHttpError } from "../utils/httpError.js";

const StatusUpdatePayload = z.object({
  status: z.enum([
    "PENDING",
    "ACCEPTED",
    "IN_TRANSIT",
    "DELIVERED",
    "CLOSED",
    "CANCELLED",
  ]),
  toUserId: z.string().uuid().optional(),
});

export async function listShipmentSegments(req, res) {
  try {
    const shipmentId = req.params.id;
    if (!shipmentId) {
      return res.status(400).json({ message: "Shipment id is required" });
    }

    const segments = await listShipmentSegmentsForShipment(shipmentId);
    return res.json(segments);
  } catch (err) {
    if (isHttpError(err)) {
      const body =
        err.details !== undefined
          ? { error: err.message, details: err.details }
          : { error: err.message };
      return res.status(err.statusCode).json(body);
    }
    return respondWithRegistrationError(res, err);
  }
}

export async function updateShipmentSegmentStatusById(req, res) {
  try {
    const segmentId = req.params.id;
    if (!segmentId) {
      return res.status(400).json({ message: "Segment id is required" });
    }

    const parsed = StatusUpdatePayload.parse(req.body ?? {});
    const updated = await updateShipmentSegmentStatus({
      segmentId,
      status: parsed.status,
      toUserId: parsed.toUserId ?? null,
      walletAddress: req.wallet?.walletAddress ?? null,
    });
    return res.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ message: "Invalid payload", details: err.errors });
    }
    if (isHttpError(err)) {
      const body =
        err.details !== undefined
          ? { error: err.message, details: err.details }
          : { error: err.message };
      return res.status(err.statusCode).json(body);
    }
    return respondWithRegistrationError(res, err);
  }
}
