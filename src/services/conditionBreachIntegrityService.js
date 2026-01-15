import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";

const EMPTY = "";
const BREACH_FIELDS = [
  "packageId",
  "messageId",
  "sensorReadingId",
  "breachType",
  "severity",
  "breachStartTime",
  "breachEndTime",
  "durationSeconds",
  "hasDataGaps",
  "totalGapDurationSeconds",
  "gapDetails",
  "breachCertainty",
  "measuredMinValue",
  "measuredMaxValue",
  "measuredAvgValue",
  "expectedMinValue",
  "expectedMaxValue",
  "locationLatitude",
  "locationLongitude",
  "shipmentId",
  "segmentId",
  "shipmentStatus",
  "notes",
];

function toStringValue(value) {
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : value.toISOString();
  }
  // Handle boolean that might be stored as 0/1 or "true"/"false"
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : EMPTY;
  }
  return String(value).trim();
}

function normalizeUuid(value) {
  const str = toStringValue(value);
  return str ? str.toLowerCase() : EMPTY;
}

function normalizeNumber(value, preserveStringFormat = false) {
  // CRITICAL: Empty strings should remain empty (not converted to EMPTY string again)
  if (value === EMPTY || value === "") {
    return EMPTY;
  }
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : EMPTY;
  }
  const str = toStringValue(value);
  if (!str) {
    return EMPTY;
  }

  // For coordinate values, preserve the original string format to maintain precision
  if (preserveStringFormat && /^\d+\.\d+$/.test(str)) {
    const numeric = Number(str);
    return Number.isFinite(numeric) ? str : EMPTY;
  }

  const numeric = Number(str);
  return Number.isFinite(numeric) ? String(numeric) : EMPTY;
}

function normalizeBoolean(value) {
  // CRITICAL: Empty strings should remain empty (not converted to "false")
  if (value === EMPTY || value === "") {
    return EMPTY;
  }
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const str = toStringValue(value).toLowerCase();
  if (str === "true" || str === "false") {
    return str;
  }
  return EMPTY;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === EMPTY) {
    return EMPTY;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : value.toISOString();
  }
  if (typeof value === "number") {
    const millis = value < 1e12 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? EMPTY : date.toISOString();
  }
  const str = toStringValue(value);
  if (!str) {
    return EMPTY;
  }
  const numeric = Number(str);
  if (Number.isFinite(numeric)) {
    return normalizeTimestamp(numeric);
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? EMPTY : date.toISOString();
}

function normalizeJson(value) {
  // CRITICAL: Empty strings should remain empty
  if (value === EMPTY || value === "") {
    return EMPTY;
  }
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return EMPTY;
    }
    try {
      // Parse the string and re-stringify with stable order
      const parsed = JSON.parse(trimmed);
      return stableStringify(parsed);
    } catch {
      // If it's not valid JSON, return as-is (already normalized)
      return trimmed;
    }
  }
  return stableStringify(value);
}

export function normalizeConditionBreachPayload(payload) {
  console.log("🔄 NORMALIZATION DEBUG (BEFORE):");
  console.log("  payload:", JSON.stringify(payload, null, 2));

  const normalized = {
    packageId: normalizeUuid(payload.packageId),
    messageId: normalizeUuid(payload.messageId),
    sensorReadingId: normalizeUuid(payload.sensorReadingId),
    breachType: toStringValue(payload.breachType),
    severity: toStringValue(payload.severity),
    breachStartTime: normalizeTimestamp(payload.breachStartTime),
    breachEndTime: normalizeTimestamp(payload.breachEndTime),
    durationSeconds: normalizeNumber(payload.durationSeconds),
    breachCertainty: toStringValue(payload.breachCertainty),
    locationLatitude: normalizeNumber(payload.locationLatitude, true),
    locationLongitude: normalizeNumber(payload.locationLongitude, true),
    shipmentId: normalizeUuid(payload.shipmentId),
    segmentId: normalizeUuid(payload.segmentId),
    shipmentStatus: toStringValue(payload.shipmentStatus),
    notes: toStringValue(payload.notes),
  };

  // CRITICAL: Only include hasDataGaps if it was present in the original payload
  // This prevents the creation vs verification mismatch
  if ("hasDataGaps" in payload) {
    normalized.hasDataGaps = normalizeBoolean(payload.hasDataGaps);
  }

  // Only normalize fields that exist in the input payload
  // This prevents adding empty fields that weren't in the original
  if ("totalGapDurationSeconds" in payload) {
    normalized.totalGapDurationSeconds = normalizeNumber(
      payload.totalGapDurationSeconds
    );
  }
  if ("gapDetails" in payload) {
    normalized.gapDetails = normalizeJson(payload.gapDetails);
  }
  if ("measuredMinValue" in payload) {
    normalized.measuredMinValue = normalizeNumber(payload.measuredMinValue);
  }
  if ("measuredMaxValue" in payload) {
    normalized.measuredMaxValue = normalizeNumber(payload.measuredMaxValue);
  }
  if ("measuredAvgValue" in payload) {
    normalized.measuredAvgValue = normalizeNumber(payload.measuredAvgValue);
  }
  if ("expectedMinValue" in payload) {
    normalized.expectedMinValue = normalizeNumber(payload.expectedMinValue);
  }
  if ("expectedMaxValue" in payload) {
    normalized.expectedMaxValue = normalizeNumber(payload.expectedMaxValue);
  }

  console.log("🔄 NORMALIZATION DEBUG (AFTER):");
  console.log("  normalized:", JSON.stringify(normalized, null, 2));

  return normalized;
}

export function buildConditionBreachCanonicalPayload(breachId, payload) {
  const entries = {};

  // Only include fields that exist in the payload
  // This prevents adding empty values for fields that weren't in the original
  // NOTE: DO NOT include 'id' because it doesn't exist when original hash is calculated during creation
  for (const field of BREACH_FIELDS) {
    if (field in payload) {
      entries[field] = payload[field] ?? EMPTY;
    }
  }

  const canonicalJson = stableStringify(entries);

  console.log("🔨 HASH CREATION DEBUG:");
  console.log("  breachId:", breachId);
  console.log("  payload keys:", Object.keys(payload));
  console.log("  entries keys:", Object.keys(entries));
  console.log("  entries:", JSON.stringify(entries, null, 2));
  console.log("  canonical JSON:", canonicalJson);

  return canonicalJson;
}

export function computeConditionBreachHashFromCanonical(canonical) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  console.log("🔐 HASH COMPUTATION:");
  console.log("  canonical input:", canonical);
  console.log("  computed hash:", hash);
  return hash;
}

export function prepareConditionBreachPersistence(
  breachId,
  payload,
  defaults = {},
  overrides = {}
) {
  const merged = { ...defaults, ...payload, ...overrides };
  const normalized = normalizeConditionBreachPayload(merged);
  const canonical = buildConditionBreachCanonicalPayload(breachId, normalized);
  const payloadHash = computeConditionBreachHashFromCanonical(canonical);
  return { normalized, canonical, payloadHash };
}

export function deriveConditionBreachPayloadFromRecord(record) {
  // CRITICAL: Extract values EXACTLY as they would have been during creation
  // Handle both snake_case (from DB) and camelCase (from JS objects)

  const payload = {
    packageId: record.package_id ?? record.packageId,
    messageId: record.message_id ?? record.messageId,
    sensorReadingId: record.sensor_reading_id ?? record.sensorReadingId,
    breachType: record.breach_type ?? record.breachType,
    severity: record.severity,
    breachStartTime: record.breach_start_time ?? record.breachStartTime,
    breachEndTime: record.breach_end_time ?? record.breachEndTime,
    durationSeconds: record.duration_seconds ?? record.durationSeconds,
    breachCertainty: record.breach_certainty ?? record.breachCertainty,
    locationLatitude: record.location_latitude ?? record.locationLatitude,
    locationLongitude: record.location_longitude ?? record.locationLongitude,
    shipmentId: record.shipment_id ?? record.shipmentId,
    segmentId: record.segment_id ?? record.segmentId,
    shipmentStatus: record.shipment_status ?? record.shipmentStatus,
    notes: record.notes,
  };

  // For TEMPERATURE_EXCURSION breaches, include measurement fields even if they're 0/null
  // For DOOR_TAMPER breaches, only include measurement fields if they exist and are non-null
  const breachType = record.breach_type ?? record.breachType;

  if (breachType === "TEMPERATURE_EXCURSION") {
    // Temperature breaches always have these fields during creation (even if null)
    payload.hasDataGaps = record.has_data_gaps ?? record.hasDataGaps;
    payload.totalGapDurationSeconds =
      record.total_gap_duration_seconds ?? record.totalGapDurationSeconds;
    payload.gapDetails = record.gap_details;
    payload.measuredMinValue =
      record.measured_min_value ?? record.measuredMinValue;
    payload.measuredMaxValue =
      record.measured_max_value ?? record.measuredMaxValue;
    payload.measuredAvgValue =
      record.measured_avg_value ?? record.measuredAvgValue;
    payload.expectedMinValue =
      record.expected_min_value ?? record.expectedMinValue;
    payload.expectedMaxValue =
      record.expected_max_value ?? record.expectedMaxValue;
  } else {
    // For DOOR_TAMPER breaches, DO NOT include hasDataGaps as it wasn't in original payload
    // Only include other fields if non-null
    if (record.total_gap_duration_seconds !== null) {
      payload.totalGapDurationSeconds = record.total_gap_duration_seconds;
    }
    if (record.gap_details !== null) {
      payload.gapDetails = record.gap_details;
    }
    if (record.measured_min_value !== null) {
      payload.measuredMinValue = record.measured_min_value;
    }
    if (record.measured_max_value !== null) {
      payload.measuredMaxValue = record.measured_max_value;
    }
    if (record.measured_avg_value !== null) {
      payload.measuredAvgValue = record.measured_avg_value;
    }
    if (record.expected_min_value !== null) {
      payload.expectedMinValue = record.expected_min_value;
    }
    if (record.expected_max_value !== null) {
      payload.expectedMaxValue = record.expected_max_value;
    }
  }

  return payload;
}
