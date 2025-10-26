import { ZodError } from "zod";
import {
  createCheckpoint,
  updateCheckpointDetails,
  getCheckpointDetails,
  listCheckpointsByOwner,
  listAllCheckpointRecords,
  searchCheckpointRecords,
  listApprovedCheckpointsForUser,
  getApprovedCheckpointRecord,
  listApprovedCheckpointsByType,
} from "../services/checkpointService.js";
import {
  respondWithZodError,
  handleControllerError,
} from "./helpers/errorResponse.js";

export async function registerCheckpoint(req, res) {
  try {
    const { statusCode, body } = await createCheckpoint({
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
      logMessage: "Error registering checkpoint",
      fallbackMessage: "Unable to register checkpoint",
    });
  }
}

export async function updateCheckpoint(req, res) {
  try {
    const { statusCode, body } = await updateCheckpointDetails({
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
      logMessage: "Error updating checkpoint",
      fallbackMessage: "Unable to update checkpoint",
    });
  }
}

export async function getCheckpoint(req, res) {
  try {
    const { statusCode, body } = await getCheckpointDetails({
      id: req.params.id,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching checkpoint",
      fallbackMessage: "Unable to fetch checkpoint",
    });
  }
}

export async function listCheckpointsForOwner(req, res) {
  try {
    const { statusCode, body } = await listCheckpointsByOwner({
      ownerUuid: req.params.ownerUuid,
      registration: req.registration,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "GET /api/checkpoints/owner/:ownerUuid error",
      fallbackMessage: "Unable to list checkpoints",
    });
  }
}

export async function listAllCheckpoints(req, res) {
  try {
    const { userId, checkpointId, type } = req.query;
    const hasIdFilters = Boolean(
      (typeof userId === "string" && userId.trim().length > 0) ||
        (typeof checkpointId === "string" && checkpointId.trim().length > 0)
    );
    const hasTypeFilter =
      typeof type === "string" && type.trim().length > 0;

    let serviceResponse;
    if (hasIdFilters) {
      serviceResponse = await searchCheckpointRecords({
        userId,
        checkpointId,
      });
    } else if (hasTypeFilter) {
      serviceResponse = await listApprovedCheckpointsByType({ regType: type });
    } else {
      serviceResponse = await listAllCheckpointRecords();
    }

    const { statusCode, body } = serviceResponse;
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing checkpoints",
      fallbackMessage: "Unable to list checkpoints",
    });
  }
}

export async function listCheckpointsByUserId(req, res) {
  try {
    const { statusCode, body } = await listApprovedCheckpointsForUser({
      ownerUuid: req.params.userId,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error listing checkpoints for userId param",
      fallbackMessage: "Unable to list checkpoints for user",
    });
  }
}

export async function getCheckpointByCheckpointId(req, res) {
  try {
    const { statusCode, body } = await getApprovedCheckpointRecord({
      checkpointId: req.params.checkpointId,
    });
    return res.status(statusCode).json(body);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching checkpoint for checkpointId param",
      fallbackMessage: "Unable to fetch checkpoint",
    });
  }
}
