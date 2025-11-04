import { randomUUID } from "node:crypto";
import {
  SensorDataBreachPayload,
  SensorDataBreachQuery,
} from "../domain/sensorDataBreach.schema.js";
import {
  insertSensorDataBreach,
  listSensorDataBreachesBySensorDataId,
  findSensorDataBreachById,
} from "../models/SensorDataBreachModel.js";
import { findSensorDataById } from "../models/SensorDataModel.js";
import { findPackageById } from "../models/PackageRegistryModel.js";
import { sensorDataValidationError } from "../errors/sensorDataErrors.js";
import { prepareSensorDataBreachPersistence } from "./sensorDataBreachIntegrityService.js";
import { registerSensorDataBreachOnChain } from "../eth/sensorDataBreachContract.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { normalizeHash } from "../utils/hash.js";
import { backupRecordSafely } from "./pinataBackupService.js";

function parseTimestamp(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const millis = value < 1e12 ? value * 1000 : value;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) {
      throw sensorDataValidationError(`${fieldName} must be a valid timestamp`);
    }
    return date;
  }
  const trimmed = typeof value === "string" ? value.trim() : String(value).trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return parseTimestamp(numeric, fieldName);
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw sensorDataValidationError(`${fieldName} must be a valid timestamp`);
  }
  return date;
}

function formatSensorDataBreach(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id ?? null,
    sensorDataId: record.sensor_data_id ?? null,
    sensorType: record.sensor_type ?? null,
    reading: record.reading ?? null,
    note: record.note ?? null,
    detectedAt: record.detected_at
      ? new Date(record.detected_at).toISOString()
      : null,
    createdAt: record.created_at
      ? new Date(record.created_at).toISOString()
      : null,
    payloadHash: normalizeHash(record.payload_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at
      ? new Date(record.pinata_pinned_at).toISOString()
      : null,
  };
}

export async function createSensorDataBreachEntry({ payload, wallet }) {
  const parsed = SensorDataBreachPayload.parse(payload ?? {});

  const sensorDataRecord = await findSensorDataById(parsed.sensorDataId);
  if (!sensorDataRecord) {
    throw sensorDataValidationError("sensorDataId does not exist");
  }

  const packageId = sensorDataRecord.package_id ?? sensorDataRecord.packageId ?? null;
  if (!packageId) {
    throw sensorDataValidationError("Sensor data record missing package reference");
  }

  const packageRecord = await findPackageById(packageId);
  if (!packageRecord) {
    throw sensorDataValidationError("Package linked to sensor data not found");
  }

  const manufacturerUuid = packageRecord.manufacturer_uuid ?? packageRecord.manufacturerUUID ?? null;
  if (!manufacturerUuid) {
    throw sensorDataValidationError("Package record missing manufacturer UUID");
  }

  const detectedAt = parseTimestamp(parsed.detectedAt, "detectedAt");
  const createdAt = new Date();

  const breachId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareSensorDataBreachPersistence(
    breachId,
    {
      sensorDataId: parsed.sensorDataId,
      sensorType: parsed.sensorType,
      reading: parsed.reading ?? null,
      note: parsed.note ?? null,
      detectedAt,
      createdAt,
    }
  );

  const { txHash, payloadHash: onChainHash } = await registerSensorDataBreachOnChain(
    uuidToBytes16Hex(breachId),
    uuidToBytes16Hex(manufacturerUuid),
    uuidToBytes16Hex(packageId),
    uuidToBytes16Hex(parsed.sensorDataId),
    canonical
  );

  const normalizedOnChain = normalizeHash(onChainHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw sensorDataValidationError("On-chain sensor data breach hash mismatch", {
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "sensor_data_breach",
    record: {
      id: breachId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: breachId,
    errorMessage: "⚠️ Failed to back up sensor data breach to Pinata:",
  });

  const record = await insertSensorDataBreach({
    id: breachId,
    sensorDataId: normalized.sensorDataId,
    sensorType: normalized.sensorType,
    reading: normalized.reading || null,
    note: normalized.note || null,
    detectedAt,
    createdAt,
    payloadHash,
    txHash,
    createdBy: wallet?.walletAddress ?? null,
    pinataCid: pinataBackup?.IpfsHash ?? null,
    pinataPinnedAt: pinataBackup?.Timestamp
      ? new Date(pinataBackup.Timestamp)
      : null,
  });

  return {
    statusCode: 201,
    body: formatSensorDataBreach(record),
  };
}

export async function listSensorDataBreaches({ sensorDataId }) {
  const { sensorDataId: normalizedId } = SensorDataBreachQuery.parse({ sensorDataId });

  const sensorDataRecord = await findSensorDataById(normalizedId);
  if (!sensorDataRecord) {
    throw sensorDataValidationError("sensorDataId does not exist");
  }

  const rows = await listSensorDataBreachesBySensorDataId(normalizedId);
  return {
    statusCode: 200,
    body: rows.map(formatSensorDataBreach),
  };
}

export async function getSensorDataBreach({ id }) {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    throw sensorDataValidationError("id is required");
  }

  const record = await findSensorDataBreachById(trimmed);
  if (!record) {
    throw sensorDataValidationError("sensor data breach not found");
  }

  return {
    statusCode: 200,
    body: formatSensorDataBreach(record),
  };
}

