import { randomUUID } from "node:crypto";
import {
  SensorTypePayload,
  SensorTypeUpdatePayload,
} from "../domain/sensorType.schema.js";
import {
  createSensorType,
  updateSensorType,
  deleteSensorType,
  findSensorTypeById,
  findSensorTypeByName,
  listSensorTypesByManufacturer,
} from "../models/SensorTypeModel.js";
import {
  registrationRequired,
  sensorTypeAlreadyExists,
  sensorTypeForbidden,
  sensorTypeNotFound,
} from "../errors/sensorTypeErrors.js";

function ensureRegistration(registration) {
  if (!registration?.id) {
    throw registrationRequired();
  }
}

function ensureOwnership(record, registration) {
  if (!registration?.id) {
    throw registrationRequired();
  }

  const manufacturerId =
    record?.manufacturer_id ?? record?.manufacturerId ?? null;
  if (
    !manufacturerId ||
    manufacturerId.toLowerCase() !== registration.id.toLowerCase()
  ) {
    throw sensorTypeForbidden();
  }
}

function formatSensorType(record) {
  return {
    id: record.id ?? null,
    name: record.name ?? null,
    manufacturerId: record.manufacturer_id ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
  };
}

export async function createSensorTypeRecord({ payload, registration }) {
  ensureRegistration(registration);

  const parsed = SensorTypePayload.parse(payload);
  const manufacturerId = registration.id;

  const existing = await findSensorTypeByName({
    manufacturerId,
    name: parsed.name,
  });
  if (existing) {
    throw sensorTypeAlreadyExists(parsed.name);
  }

  const record = await createSensorType({
    id: randomUUID(),
    manufacturerId,
    name: parsed.name.trim(),
  });

  return {
    statusCode: 201,
    body: formatSensorType(record),
  };
}

export async function updateSensorTypeRecord({
  id,
  payload,
  registration,
}) {
  ensureRegistration(registration);

  const existing = await findSensorTypeById(id);
  if (!existing) {
    throw sensorTypeNotFound();
  }
  ensureOwnership(existing, registration);

  const parsed = SensorTypeUpdatePayload.parse(payload);
  if (
    parsed.name.trim().toLowerCase() !==
    existing.name.trim().toLowerCase()
  ) {
    const conflict = await findSensorTypeByName({
      manufacturerId: registration.id,
      name: parsed.name,
    });
    if (conflict) {
      throw sensorTypeAlreadyExists(parsed.name);
    }
  }

  const record = await updateSensorType({
    id,
    manufacturerId: registration.id,
    name: parsed.name.trim(),
  });

  if (!record) {
    throw sensorTypeNotFound();
  }

  return {
    statusCode: 200,
    body: formatSensorType(record),
  };
}

export async function deleteSensorTypeRecord({ id, registration }) {
  ensureRegistration(registration);

  const existing = await findSensorTypeById(id);
  if (!existing) {
    throw sensorTypeNotFound();
  }
  ensureOwnership(existing, registration);

  const deleted = await deleteSensorType({
    id,
    manufacturerId: registration.id,
  });
  if (!deleted) {
    throw sensorTypeNotFound();
  }

  return {
    statusCode: 204,
    body: null,
  };
}

export async function getSensorTypeRecord({ id, registration }) {
  ensureRegistration(registration);

  const record = await findSensorTypeById(id);
  if (!record) {
    throw sensorTypeNotFound();
  }
  ensureOwnership(record, registration);

  return {
    statusCode: 200,
    body: formatSensorType(record),
  };
}

export async function listSensorTypes({ registration }) {
  ensureRegistration(registration);

  const rows = await listSensorTypesByManufacturer(registration.id);
  return {
    statusCode: 200,
    body: rows.map((row) => formatSensorType(row)),
  };
}
