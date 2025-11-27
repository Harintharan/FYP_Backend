/**
 * Breach Detection Service
 * Detects condition breaches from sensor readings
 */

import { randomUUID } from "node:crypto";
import {
  getBreachConfig,
  getSeverityThresholds,
} from "../config/breachDetectionConfig.js";
import { insertConditionBreach } from "../models/ConditionBreachModel.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { registerConditionBreachOnChain } from "../eth/conditionBreachContract.js";
import { backupRecordSafely } from "./pinataBackupService.js";
import { prepareSensorDataBreachPersistence } from "./sensorDataBreachIntegrityService.js";
import { stableStringify } from "../utils/canonicalize.js";

/**
 * Calculate severity based on deviation from expected range
 */
function calculateSeverity(values, minThreshold, maxThreshold, sensorType) {
  const thresholds = getSeverityThresholds(sensorType);

  // Calculate maximum deviation from the allowed range
  const maxDeviation = Math.max(
    ...values.map((v) =>
      Math.max(
        minThreshold - v, // How much below min
        v - maxThreshold // How much above max
      )
    )
  );

  if (maxDeviation >= thresholds.CRITICAL) return "CRITICAL";
  if (maxDeviation >= thresholds.HIGH) return "HIGH";
  if (maxDeviation >= thresholds.MEDIUM) return "MEDIUM";
  return "LOW";
}

/**
 * Generate breach notes with gap information
 */
function generateBreachNotes(breach) {
  const notes = [];

  if (breach.gaps && breach.gaps.length > 0) {
    const totalGapTime = breach.gaps.reduce((sum, g) => sum + g.gap_seconds, 0);
    notes.push(
      `${breach.gaps.length} data gap(s) during breach (total ${totalGapTime}s)`
    );
  }

  if (breach.customNote) {
    notes.push(breach.customNote);
  }

  return notes.length > 0 ? notes.join(". ") : null;
}

/**
 * Finalize and save a breach record
 */
async function saveBreachRecord(breach, context, dbClient) {
  const {
    packageId,
    messageId,
    minThreshold,
    maxThreshold,
    sensorType,
    shipmentId,
    shipmentStatus,
    wallet,
  } = context;

  const breachId = randomUUID();
  const lastReading = breach.readings[breach.readings.length - 1];

  const breachData = {
    packageId,
    messageId,
    sensorReadingId: breach.readings[0].id,
    breachType: `${sensorType.toUpperCase()}_EXCURSION`,
    severity: calculateSeverity(
      breach.values,
      minThreshold,
      maxThreshold,
      sensorType
    ),
    breachStartTime: breach.breach_start_time,
    breachEndTime: lastReading.sensor_timestamp || lastReading.sensor_timestamp,
    durationSeconds:
      (new Date(
        lastReading.sensor_timestamp || lastReading.sensor_timestamp
      ).getTime() -
        new Date(breach.breach_start_time).getTime()) /
      1000,
    hasDataGaps: (breach.gaps && breach.gaps.length > 0) || false,
    totalGapDurationSeconds: breach.gaps
      ? breach.gaps.reduce((sum, g) => sum + g.gap_seconds, 0)
      : null,
    gapDetails: breach.gaps && breach.gaps.length > 0 ? breach.gaps : null,
    breachCertainty: "CONFIRMED",
    measuredMinValue: Math.min(...breach.values),
    measuredMaxValue: Math.max(...breach.values),
    measuredAvgValue:
      breach.values.reduce((a, b) => a + b) / breach.values.length,
    expectedMinValue: minThreshold,
    expectedMaxValue: maxThreshold,
    locationLatitude: breach.readings[0].latitude,
    locationLongitude: breach.readings[0].longitude,
    shipmentId: shipmentId ?? null,
    shipmentStatus: shipmentStatus ?? null,
    notes: generateBreachNotes(breach),
  };

  // Prepare for blockchain
  const { normalized, canonical, payloadHash } =
    prepareSensorDataBreachPersistence(breachId, breachData);

  // Register on blockchain with breach start time
  const breachStartUnix = Math.floor(
    new Date(breachData.breachStartTime).getTime() / 1000
  );

  const { txHash } = await registerConditionBreachOnChain(
    uuidToBytes16Hex(breachId),
    uuidToBytes16Hex(packageId),
    messageId
      ? uuidToBytes16Hex(messageId)
      : "0x00000000000000000000000000000000",
    canonical,
    breachStartUnix
  );

  // Backup to Pinata
  const pinataBackup = await backupRecordSafely({
    entity: "condition_breach",
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
    errorMessage: "⚠️ Failed to back up condition breach to Pinata:",
  });

  // Save to database
  const savedBreach = await insertConditionBreach(
    {
      id: breachId,
      ...breachData,
      payloadHash,
      txHash,
      pinataCid: pinataBackup?.IpfsHash ?? null,
      pinataPinnedAt: pinataBackup?.Timestamp
        ? new Date(pinataBackup.Timestamp)
        : null,
      createdBy: wallet?.walletAddress ?? null,
    },
    dbClient
  );

  return savedBreach;
}

/**
 * Detect temperature breaches from sensor readings
 */
export async function detectTemperatureBreaches(
  packageId,
  sensorReadings,
  productRequirements,
  context,
  dbClient
) {
  const { messageId, shipmentId, shipmentStatus, wallet } = context;

  const minTemp = parseFloat(productRequirements.required_start_temp);
  const maxTemp = parseFloat(productRequirements.required_end_temp);

  if (isNaN(minTemp) || isNaN(maxTemp)) {
    return [];
  }

  const config = getBreachConfig("Temperature");

  // Filter and sort temperature readings (handle both camelCase and snake_case)
  const tempReadings = sensorReadings
    .filter(
      (r) => r.sensorType === "Temperature" || r.sensor_type === "Temperature"
    )
    .sort(
      (a, b) =>
        (a.sensorTimestampUnix || a.sensor_timestamp_unix) -
        (b.sensorTimestampUnix || b.sensor_timestamp_unix)
    );

  if (tempReadings.length === 0) {
    return [];
  }

  const breaches = [];
  let currentBreach = null;

  for (let i = 0; i < tempReadings.length; i++) {
    const reading = tempReadings[i];
    const prevReading = i > 0 ? tempReadings[i - 1] : null;
    const temp = parseFloat(reading.valueNumber || reading.value_number);
    const isBreached = temp < minTemp || temp > maxTemp;

    // Calculate time gap from previous reading
    const timeGap = prevReading
      ? (reading.sensorTimestampUnix || reading.sensor_timestamp_unix) -
        (prevReading.sensorTimestampUnix || prevReading.sensor_timestamp_unix)
      : 0;

    if (isBreached) {
      if (!currentBreach) {
        // START new breach
        currentBreach = {
          breach_start_time:
            reading.sensorTimestamp || reading.sensor_timestamp,
          breach_start_unix:
            reading.sensorTimestampUnix || reading.sensor_timestamp_unix,
          readings: [reading],
          values: [temp],
          gaps: [],
        };
      } else {
        // Check for large gap
        if (timeGap > config.maxGapTolerance) {
          // Large gap detected - finalize previous breach and start new one
          await saveBreachRecord(
            currentBreach,
            {
              packageId,
              messageId,
              minThreshold: minTemp,
              maxThreshold: maxTemp,
              sensorType: "Temperature",
              shipmentId,
              shipmentStatus,
              wallet,
              assumedEnd: true,
              gapSize: timeGap,
            },
            dbClient
          );

          breaches.push(currentBreach);

          // Start new breach after gap
          currentBreach = {
            breach_start_time:
              reading.sensorTimestamp || reading.sensor_timestamp,
            breach_start_unix:
              reading.sensorTimestampUnix || reading.sensor_timestamp_unix,
            readings: [reading],
            values: [temp],
            gaps: [],
            customNote: `Breach started after ${timeGap}s data gap`,
          };
        } else {
          // CONTINUE existing breach
          currentBreach.readings.push(reading);
          currentBreach.values.push(temp);

          // Track moderate gaps within breach
          if (timeGap > config.expectedInterval * 2) {
            currentBreach.gaps.push({
              gap_start:
                prevReading.sensorTimestamp || prevReading.sensor_timestamp,
              gap_end: reading.sensorTimestamp || reading.sensor_timestamp,
              gap_seconds: timeGap,
            });
          }
        }
      }
    } else {
      // Normal temperature - check if breach ended
      if (currentBreach) {
        // Breach ended - save the record
        await saveBreachRecord(
          currentBreach,
          {
            packageId,
            messageId,
            minThreshold: minTemp,
            maxThreshold: maxTemp,
            sensorType: "Temperature",
            shipmentId,
            shipmentStatus,
            wallet,
          },
          dbClient
        );

        breaches.push(currentBreach);
        currentBreach = null;
      }
    }
  }

  // Save any ongoing breach at end of batch as a snapshot
  if (currentBreach) {
    await saveBreachRecord(
      currentBreach,
      {
        packageId,
        messageId,
        minThreshold: minTemp,
        maxThreshold: maxTemp,
        sensorType: "Temperature",
        shipmentId,
        shipmentStatus,
        wallet,
      },
      dbClient
    );

    breaches.push(currentBreach);
  }

  return breaches;
}

/**
 * Detect door tamper breaches
 */
export async function detectDoorTamperBreaches(
  packageId,
  sensorReadings,
  shipmentInfo,
  context,
  dbClient
) {
  const { messageId, wallet } = context;
  const { shipment_id: shipmentId, status: shipmentStatus } =
    shipmentInfo || {};

  // Only check for door breaches when shipment is IN_TRANSIT
  if (shipmentStatus !== "IN_TRANSIT") {
    return [];
  }

  const doorReadings = sensorReadings
    .filter((r) => r.sensorType === "Door" || r.sensor_type === "Door")
    .sort(
      (a, b) =>
        (a.sensorTimestampUnix || a.sensor_timestamp_unix) -
        (b.sensorTimestampUnix || b.sensor_timestamp_unix)
    );

  const breaches = [];

  for (const reading of doorReadings) {
    const doorStatus = (reading.valueText || reading.value_text)?.toLowerCase();

    if (doorStatus === "open" || doorStatus === "opened") {
      const breachId = randomUUID();

      const breachData = {
        packageId,
        messageId,
        sensorReadingId: reading.id,
        breachType: "DOOR_TAMPER",
        severity: "HIGH",
        breachStartTime: reading.sensorTimestamp || reading.sensor_timestamp,
        breachEndTime: reading.sensorTimestamp || reading.sensor_timestamp,
        durationSeconds: 0,
        breachCertainty: "CONFIRMED",
        locationLatitude: reading.latitude,
        locationLongitude: reading.longitude,
        shipmentId: shipmentId ?? null,
        shipmentStatus: shipmentStatus ?? null,
        notes: `Door opened during transit (shipment status: ${shipmentStatus})`,
      };

      // Prepare for blockchain
      const { normalized, canonical, payloadHash } =
        prepareSensorDataBreachPersistence(breachId, breachData);

      // Register on blockchain with breach start time
      const breachStartUnix = Math.floor(
        new Date(breachData.breachStartTime).getTime() / 1000
      );

      const { txHash } = await registerConditionBreachOnChain(
        uuidToBytes16Hex(breachId),
        uuidToBytes16Hex(packageId),
        messageId
          ? uuidToBytes16Hex(messageId)
          : "0x00000000000000000000000000000000",
        canonical,
        breachStartUnix
      );

      // Backup to Pinata
      const pinataBackup = await backupRecordSafely({
        entity: "condition_breach",
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
        errorMessage: "⚠️ Failed to back up door tamper breach to Pinata:",
      });

      // Save to database
      const savedBreach = await insertConditionBreach(
        {
          id: breachId,
          ...breachData,
          payloadHash,
          txHash,
          pinataCid: pinataBackup?.IpfsHash ?? null,
          pinataPinnedAt: pinataBackup?.Timestamp
            ? new Date(pinataBackup.Timestamp)
            : null,
          createdBy: wallet?.walletAddress ?? null,
        },
        dbClient
      );

      breaches.push(savedBreach);
    }
  }

  return breaches;
}
