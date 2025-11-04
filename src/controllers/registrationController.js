import { RegistrationPayload } from "../domain/registration.schema.js";
import {
  findPendingRegistrationSummaries,
  findApprovedRegistrationSummaries,
  findRegistrationById,
  approveRegistration,
  rejectRegistration,
} from "../models/registrationModel.js";
import { ensureOnChainIntegrity } from "../services/registrationIntegrityService.js";
import {
  createRegistrationRecord,
  updateRegistrationRecord,
} from "../services/registrationService.js";
import { respondWithRegistrationError } from "../middleware/registrationErrorMiddleware.js";
import {
  RegistrationError,
  NotFoundError,
} from "../errors/registrationErrors.js";

export async function createRegistration(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);

    const result = await createRegistrationRecord({
      payload: parsed,
      walletAddress: req.wallet?.walletAddress ?? null,
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function updateRegistrationById(req, res) {
  try {
    const parsed = RegistrationPayload.parse(req.body);
    const registrationIdParam = req.params.id;

    const result = await updateRegistrationRecord({
      registrationId: registrationIdParam,
      payload: parsed,
      walletAddress: req.wallet?.walletAddress ?? null,
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function listPendingRegistrations(_req, res) {
  try {
    const rows = await findPendingRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(
      ({ payload, payload_canonical, ...rest }) => rest
    );
    return res.json(sanitized);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function listApprovedRegistrations(_req, res) {
  try {
    const rows = await findApprovedRegistrationSummaries();
    await Promise.all(rows.map((row) => ensureOnChainIntegrity(row)));

    const sanitized = rows.map(
      ({ payload, payload_canonical, ...rest }) => rest
    );
    return res.json(sanitized);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function getRegistrationById(req, res) {
  try {
    const record = await findRegistrationById(req.params.id);
    if (!record) {
      throw new NotFoundError();
    }

    await ensureOnChainIntegrity(record);
    const { payload_canonical, ...sanitized } = record;
    return res.json(sanitized);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function approveRegistrationById(req, res) {
  try {
    const result = await approveRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      throw new RegistrationError(
        "Invalid registration ID or already processed",
        400
      );
    }
    return res.json(result);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}

export async function rejectRegistrationById(req, res) {
  try {
    const result = await rejectRegistration(
      req.params.id,
      req.wallet.walletAddress
    );
    if (!result) {
      throw new RegistrationError(
        "Invalid registration ID or already processed",
        400
      );
    }
    return res.json(result);
  } catch (err) {
    return respondWithRegistrationError(res, err);
  }
}
