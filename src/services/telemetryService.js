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

/**
 * Process incoming telemetry payload
 * This is the main entry point for sensor data
 */
export async function processTelemetryPayload({ payload, wallet }) {
  // Validate payload
  if (!payload || !payload.packageId || !payload.sensorData) {
    throw new Error("Invalid telemetry payload");
  }

  const packageId = payload.packageId;

  // Verify package exists and get related data
  const packageRecord = await findPackageById(packageId);
  if (!packageRecord) {
    throw new Error(`Package not found: ${packageId}`);
  }

  const manufacturerUuid = packageRecord.manufacturer_uuid;
  if (!manufacturerUuid) {
    throw new Error("Package record missing manufacturer UUID");
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
      : null;
    const requestReceivedTimestamp = new Date();

    // Prepare payload for blockchain
    const { normalized, canonical, payloadHash } = prepareSensorDataPersistence(
      telemetryMessageId,
      {
        packageId,
        manufacturerUUID: manufacturerUuid,
        macAddress: payload.macAddress ?? null,
        sensorData: payload.sensorData,
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
        readingCount: payload.sensorData.length,
      },
      client
    );

    // 2. Process sensor readings
    // First, normalize timestamps and populate GPS coordinates
    const rawReadings = payload.sensorData.map((reading) => ({
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
      client
    );

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
