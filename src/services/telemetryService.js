/**
 * Telemetry Service
 * Main service for processing incoming telemetry payloads
 * Handles telemetry messages, sensor readings, breach detection, and daily summaries
 */

import { randomUUID } from "node:crypto";
import { query, pool } from "../db.js";
import {
  insertTelemetryMessage,
  updateTelemetryMessageReadingCount,
} from "../models/TelemetryMessageModel.js";
import { bulkInsertSensorReadings } from "../models/SensorReadingModel.js";
import { findPackageById } from "../models/PackageRegistryModel.js";
import { getShipmentById } from "../models/ShipmentRegistryModel.js";
import { findProductById } from "../models/productModel.js";
import {
  detectTemperatureBreaches,
  detectDoorTamperBreaches,
} from "./breachDetectionService.js";
import { updateDailyConditionSummary } from "./dailySummaryService.js";
import { prepareSensorDataPersistence } from "./sensorDataIntegrityService.js";
import { registerTelemetryMessageOnChain } from "../eth/telemetryMessageContract.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { normalizeHash } from "../utils/hash.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import {
  populateGPSCoordinates,
  parseSensorValue,
  parseTimestamp,
} from "../utils/sensorDataUtils.js";

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function resolveUnixTimestamp(value) {
  if (!hasValue(value)) {
    return null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isNaN(millis) ? null : Math.floor(millis / 1000);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.floor(value) : Math.floor(value / 1000);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 1e12 ? Math.floor(numeric) : Math.floor(numeric / 1000);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function normalizeTelemetrySensorData(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const fallbackTimestamp = resolveUnixTimestamp(
    payload.timestamp ??
      payload.requestSendTimeStamp ??
      payload.requestSendTimestamp ??
      Date.now()
  );

  const rawSensorData = payload.sensorData;
  const rawItems = Array.isArray(rawSensorData)
    ? rawSensorData
    : rawSensorData
    ? [rawSensorData]
    : [];

  if (rawItems.length === 0) {
    rawItems.push(payload);
  }

  const readings = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (hasValue(item.sensorType)) {
      if (!hasValue(item.data)) {
        continue;
      }
      const timestamp = resolveUnixTimestamp(
        item.timestamp ?? fallbackTimestamp
      );
      if (!timestamp) {
        continue;
      }
      readings.push({
        sensorType: String(item.sensorType),
        data: String(item.data),
        timestamp,
      });
      continue;
    }

    const timestamp = resolveUnixTimestamp(item.timestamp ?? fallbackTimestamp);
    if (!timestamp) {
      continue;
    }

    if (hasValue(item.temperature_data)) {
      readings.push({
        sensorType: "Temperature",
        data: String(item.temperature_data),
        timestamp,
      });
    }

    if (hasValue(item.gps_data)) {
      readings.push({
        sensorType: "GPS",
        data: String(item.gps_data),
        timestamp,
      });
    }

    if (hasValue(item.door_state)) {
      readings.push({
        sensorType: "Door",
        data: String(item.door_state),
        timestamp,
      });
    }
  }

  return readings;
}

/**
 * Process incoming telemetry payload
 * This is the main entry point for sensor data
 */
export async function processTelemetryPayload({ payload, wallet }) {
  // Validate payload
  if (!payload || !payload.packageId) {
    throw new Error("Invalid telemetry payload");
  }

  const packageId = payload.packageId;
  const normalizedSensorData = normalizeTelemetrySensorData(payload);
  if (normalizedSensorData.length === 0) {
    throw new Error("Invalid telemetry payload");
  }

  const uniqueReadings = [];
  const seenReadings = new Set();
  const skippedReadings = [];

  for (const reading of normalizedSensorData) {
    const key = `${reading.sensorType}|${reading.timestamp}`;
    if (seenReadings.has(key)) {
      skippedReadings.push({
        sensorType: reading.sensorType,
        timestamp: reading.timestamp,
        reason: "duplicate_in_payload",
      });
      continue;
    }
    seenReadings.add(key);
    uniqueReadings.push(reading);
  }

  let acceptedReadings = uniqueReadings;
  if (acceptedReadings.length > 0) {
    const pairs = acceptedReadings
      .map((_, idx) => `($${idx * 2 + 2}, $${idx * 2 + 3})`)
      .join(", ");
    const params = [packageId];
    acceptedReadings.forEach((reading) => {
      params.push(reading.sensorType, reading.timestamp);
    });

    const { rows: existingReadings } = await query(
      `SELECT sensor_type, sensor_timestamp_unix
         FROM sensor_readings
        WHERE package_id = $1
          AND (sensor_type, sensor_timestamp_unix) IN (${pairs})`,
      params
    );

    if (existingReadings.length > 0) {
      const existingSet = new Set(
        existingReadings.map(
          (row) => `${row.sensor_type}|${Number(row.sensor_timestamp_unix)}`
        )
      );
      acceptedReadings = acceptedReadings.filter((reading) => {
        const key = `${reading.sensorType}|${reading.timestamp}`;
        if (existingSet.has(key)) {
          skippedReadings.push({
            sensorType: reading.sensorType,
            timestamp: reading.timestamp,
            reason: "duplicate_in_db",
          });
          return false;
        }
        return true;
      });
    }
  }

  // Verify package exists and get related data
  const packageRecord = await findPackageById(packageId);
  if (!packageRecord) {
    throw new Error(`Package not found: ${packageId}`);
  }

  const manufacturerUuid = packageRecord.manufacturer_uuid;
  if (!manufacturerUuid) {
    throw new Error("Package record missing manufacturer UUID");
  }

  if (acceptedReadings.length === 0) {
    return {
      telemetryMessage: null,
      sensorReadings: [],
      breaches: [],
      skippedReadings,
    };
  }

  // Get product info for breach detection
  let productInfo = null;
  if (packageRecord.batch_id) {
    const batchResult = await query(
      "SELECT product_id FROM batches WHERE id = $1",
      [packageRecord.batch_id]
    );
    if (batchResult.rows.length > 0) {
      productInfo = await findProductById(batchResult.rows[0].product_id);
    }
  }

  // Get shipment info for breach detection
  let shipmentInfo = null;
  if (packageRecord.shipment_id) {
    shipmentInfo = await getShipmentById(packageRecord.shipment_id);
  }

  // Start transaction
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Create telemetry message
    const telemetryMessageId = randomUUID();
    const requestSendTimestamp = payload.requestSendTimeStamp
      ? parseTimestamp(payload.requestSendTimeStamp)
      : payload.requestSendTimestamp
      ? parseTimestamp(payload.requestSendTimestamp)
      : payload.timestamp
      ? parseTimestamp(payload.timestamp)
      : null;
    const requestReceivedTimestamp = new Date();

    // Prepare payload for blockchain
    const { normalized, canonical, payloadHash } = prepareSensorDataPersistence(
      telemetryMessageId,
      {
        packageId,
        manufacturerUUID: manufacturerUuid,
        macAddress: payload.macAddress ?? null,
        sensorData: acceptedReadings,
        requestSendTimestamp,
        requestReceivedTimestamp,
      }
    );

    // Register on blockchain
    const { txHash, payloadHash: onChainHash } =
      await registerTelemetryMessageOnChain(
        uuidToBytes16Hex(telemetryMessageId),
        uuidToBytes16Hex(packageId),
        uuidToBytes16Hex(manufacturerUuid),
        canonical
      );

    // Verify hash
    const normalizedOnChain = normalizeHash(onChainHash);
    const normalizedComputed = normalizeHash(payloadHash);
    if (normalizedOnChain !== normalizedComputed) {
      throw new Error("On-chain sensor data hash mismatch");
    }

    // Backup to Pinata
    const pinataBackup = await backupRecordSafely({
      entity: "telemetry_message",
      record: {
        id: telemetryMessageId,
        payloadCanonical: canonical,
        payloadHash,
        payload: normalized,
        txHash,
      },
      walletAddress: wallet?.walletAddress ?? null,
      operation: "create",
      identifier: telemetryMessageId,
      errorMessage: "⚠️ Failed to back up telemetry message to Pinata:",
    });

    // Insert telemetry message
    const telemetryMessage = await insertTelemetryMessage(
      {
        id: telemetryMessageId,
        packageId,
        macAddress: payload.macAddress ?? null,
        ipAddress: payload.ipAddress ?? null,
        requestSendTimestamp,
        requestReceivedTimestamp,
        payloadHash,
        txHash,
        pinataCid: pinataBackup?.IpfsHash ?? null,
        pinataPinnedAt: pinataBackup?.Timestamp
          ? new Date(pinataBackup.Timestamp)
          : null,
        createdBy: wallet?.walletAddress ?? null,
        readingCount: acceptedReadings.length,
      },
      client
    );

    // 2. Process sensor readings
    // First, normalize timestamps and populate GPS coordinates
    const rawReadings = acceptedReadings.map((reading) => ({
      sensorType: reading.sensorType,
      data: reading.data,
      timestamp: reading.timestamp,
    }));

    const readingsWithGPS = populateGPSCoordinates(rawReadings);

    // Parse and prepare sensor readings for insertion
    const sensorReadings = readingsWithGPS.map((reading) => {
      const sensorTimestamp = parseTimestamp(reading.timestamp);
      const { valueNumber, valueText, unit } = parseSensorValue(
        reading.sensorType,
        reading.data
      );

      return {
        id: randomUUID(),
        messageId: telemetryMessageId,
        packageId,
        sensorType: reading.sensorType,
        rawData: reading.data,
        valueNumber,
        valueText,
        latitude: reading.latitude,
        longitude: reading.longitude,
        sensorTimestampUnix: reading.timestamp,
        sensorTimestamp,
        unit,
      };
    });

    // Bulk insert sensor readings
    const insertedReadings = await bulkInsertSensorReadings(
      sensorReadings,
      client,
      { ignoreConflicts: true }
    );
    if (insertedReadings.length !== acceptedReadings.length) {
      await updateTelemetryMessageReadingCount(
        telemetryMessageId,
        insertedReadings.length,
        client
      );
    }

    // 3. Detect breaches
    const detectedBreaches = [];

    // Temperature breach detection
    if (
      productInfo &&
      productInfo.required_start_temp &&
      productInfo.required_end_temp
    ) {
      const tempBreaches = await detectTemperatureBreaches(
        packageId,
        insertedReadings,
        productInfo,
        {
          messageId: telemetryMessageId,
          shipmentId: shipmentInfo?.id,
          shipmentStatus: shipmentInfo?.status,
          wallet,
        },
        client
      );
      detectedBreaches.push(...tempBreaches);
    }

    // Door tamper detection
    if (shipmentInfo) {
      const doorBreaches = await detectDoorTamperBreaches(
        packageId,
        insertedReadings,
        shipmentInfo,
        {
          messageId: telemetryMessageId,
          wallet,
        },
        client
      );
      detectedBreaches.push(...doorBreaches);
    }

    // 4. Update daily summary (async - don't block response)
    const summaryDate = new Date(requestReceivedTimestamp)
      .toISOString()
      .split("T")[0];
    setImmediate(async () => {
      try {
        await updateDailyConditionSummary(packageId, summaryDate);
      } catch (error) {
        console.error("Failed to update daily summary:", error);
      }
    });

    // Commit transaction
    await client.query("COMMIT");

    return {
      telemetryMessage,
      sensorReadings: insertedReadings,
      breaches: detectedBreaches,
      skippedReadings,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error processing telemetry payload",
      error.message,
      error.stack
    );
    throw error;
  } finally {
    client.release();
  }
}
