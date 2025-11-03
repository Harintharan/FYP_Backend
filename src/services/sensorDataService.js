import { randomUUID } from "node:crypto";
import { SensorDataPayload, SensorDataQuery } from "../domain/sensorData.schema.js";
import {
  insertSensorData,
  listSensorDataByPackageId,
  findSensorDataById,
} from "../models/SensorDataModel.js";
import { findPackageById } from "../models/PackageRegistryModel.js";
import {
  sensorDataValidationError,
  sensorDataNotFound,
} from "../errors/sensorDataErrors.js";
import { packageNotFound } from "../errors/packageErrors.js";
import { prepareSensorDataPersistence } from "./sensorDataIntegrityService.js";
import { registerSensorDataOnChain } from "../eth/sensorDataContract.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { normalizeHash } from "../utils/hash.js";
import { backupRecordSafely } from "./pinataBackupService.js";

function parseTimestamp(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "number") {
    const millis = value < 1e12 ? value * 1000 : value;
    const result = new Date(millis);
    if (Number.isNaN(result.getTime())) {
      throw sensorDataValidationError(`${fieldName} must be a valid timestamp`);
    }
    return result;
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

function normalizeSensorReadings(readings) {
  return readings.map((reading, index) => {
    const { sensorType, data, timestamp } = reading;
    const parsedTimestamp = parseTimestamp(timestamp, `sensorData[${index}].timestamp`);
    return {
      sensorType,
      data,
      timestamp: parsedTimestamp ? parsedTimestamp.toISOString() : null,
    };
  });
}

function formatSensorDataRecord(record) {
  if (!record) {
    return null;
  }

  const rawSensorData = record.sensor_data;
  let sensorData = [];
  if (Array.isArray(rawSensorData)) {
    sensorData = rawSensorData;
  } else if (rawSensorData && typeof rawSensorData === "object") {
    sensorData = Array.isArray(rawSensorData.readings)
      ? rawSensorData.readings
      : Array.isArray(rawSensorData.sensorData)
      ? rawSensorData.sensorData
      : [];
  } else if (typeof rawSensorData === "string") {
    try {
      const parsed = JSON.parse(rawSensorData);
      sensorData = Array.isArray(parsed) ? parsed : [];
    } catch {
      sensorData = [];
    }
  }

  return {
    id: record.id ?? null,
    packageId: record.package_id ?? null,
    macAddress: record.mac_address ?? null,
    ipAddress: record.ip_address ?? null,
    sensorData,
    requestSendTimestamp: record.request_send_timestamp
      ? new Date(record.request_send_timestamp).toISOString()
      : null,
    requestReceivedTimestamp: record.request_received_timestamp
      ? new Date(record.request_received_timestamp).toISOString()
      : null,
    payloadHash: normalizeHash(record.payload_hash ?? null),
    txHash: record.tx_hash ?? null,
    createdBy: record.created_by ?? null,
    pinataCid: record.pinata_cid ?? null,
    pinataPinnedAt: record.pinata_pinned_at
      ? new Date(record.pinata_pinned_at).toISOString()
      : null,
    createdAt: record.created_at
      ? new Date(record.created_at).toISOString()
      : null,
    updatedAt: record.updated_at
      ? new Date(record.updated_at).toISOString()
      : null,
  };
}

export async function createSensorDataEntry({ payload, wallet }) {
  const normalizedInput = {
    ...payload,
    sensorData: payload?.sensorData ?? payload?.sensordata ?? [],
  };
  const parsed = SensorDataPayload.parse(normalizedInput ?? {});

  const packageRecord = await findPackageById(parsed.packageId);
  if (!packageRecord) {
    throw packageNotFound();
  }
  const manufacturerUuid =
    packageRecord.manufacturer_uuid ??
    packageRecord.manufacturerUUID ??
    null;
  if (!manufacturerUuid) {
    throw sensorDataValidationError("Package record missing manufacturer UUID");
  }

  const requestSendTimestamp = parseTimestamp(
    parsed.requestSendTimeStamp,
    "requestSendTimeStamp"
  );
  const sensorReadings = normalizeSensorReadings(parsed.sensorData);
  const requestReceivedTimestamp = new Date();

  const sensorDataId = randomUUID();
  const { normalized, canonical, payloadHash } = prepareSensorDataPersistence(
    sensorDataId,
    {
      packageId: parsed.packageId,
      manufacturerUUID: manufacturerUuid,
      macAddress: parsed.macAddress ?? null,
      sensorData: sensorReadings,
      requestSendTimestamp,
      requestReceivedTimestamp,
    }
  );

  const { txHash, payloadHash: onChainHash } = await registerSensorDataOnChain(
    uuidToBytes16Hex(sensorDataId),
    uuidToBytes16Hex(manufacturerUuid),
    uuidToBytes16Hex(parsed.packageId),
    canonical
  );

  const normalizedOnChain = normalizeHash(onChainHash);
  const normalizedComputed = normalizeHash(payloadHash);
  if (normalizedOnChain !== normalizedComputed) {
    throw sensorDataValidationError("On-chain sensor data hash mismatch", {
      onChain: normalizedOnChain,
      computed: normalizedComputed,
    });
  }

  const pinataBackup = await backupRecordSafely({
    entity: "sensor_data",
    record: {
      id: sensorDataId,
      payloadCanonical: canonical,
      payloadHash,
      payload: normalized,
      txHash,
    },
    walletAddress: wallet?.walletAddress ?? null,
    operation: "create",
    identifier: sensorDataId,
    errorMessage: "⚠️ Failed to back up sensor data to Pinata:",
  });

  const record = await insertSensorData({
    id: sensorDataId,
    packageId: normalized.packageId,
    macAddress: normalized.macAddress || null,
    ipAddress: parsed.ipAddress ?? null,
    sensorData: normalized.sensorData,
    requestSendTimestamp,
    requestReceivedTimestamp,
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
    body: formatSensorDataRecord(record),
  };
}

export async function listSensorDataEntries({ packageId }) {
  const { packageId: normalizedPackageId } = SensorDataQuery.parse({ packageId });

  const packageRecord = await findPackageById(normalizedPackageId);
  if (!packageRecord) {
    throw packageNotFound();
  }

  const rows = await listSensorDataByPackageId(normalizedPackageId);
  return {
    statusCode: 200,
    body: rows.map(formatSensorDataRecord),
  };
}

export async function getSensorDataEntry({ id }) {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    throw sensorDataValidationError("id is required");
  }

  const record = await findSensorDataById(trimmed);
  if (!record) {
    throw sensorDataNotFound();
  }

  return {
    statusCode: 200,
    body: formatSensorDataRecord(record),
  };
}

