import { ZodError } from "zod";
import { processTelemetryPayload } from "../services/telemetryService.js";
import { respondWithZodError } from "../http/responders/validationErrorResponder.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

export async function postTelemetry(req, res) {
  try {
    const result = await processTelemetryPayload({
      payload: req.body,
      wallet: req.wallet,
    });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return respondWithZodError(res, err);
    }
    return handleControllerError(res, err, {
      logMessage: "Error processing telemetry payload",
      fallbackMessage: "Unable to process telemetry payload",
    });
  }
}
