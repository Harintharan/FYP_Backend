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

function normalizeNumber(value) {
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
  return {
    packageId: normalizeUuid(payload.packageId),
    messageId: normalizeUuid(payload.messageId),
    sensorReadingId: normalizeUuid(payload.sensorReadingId),
    breachType: toStringValue(payload.breachType),
    severity: toStringValue(payload.severity),
    breachStartTime: normalizeTimestamp(payload.breachStartTime),
    breachEndTime: normalizeTimestamp(payload.breachEndTime),
    durationSeconds: normalizeNumber(payload.durationSeconds),
    hasDataGaps: normalizeBoolean(payload.hasDataGaps),
    totalGapDurationSeconds: normalizeNumber(payload.totalGapDurationSeconds),
    gapDetails: normalizeJson(payload.gapDetails),
    breachCertainty: toStringValue(payload.breachCertainty),
    measuredMinValue: normalizeNumber(payload.measuredMinValue),
    measuredMaxValue: normalizeNumber(payload.measuredMaxValue),
    measuredAvgValue: normalizeNumber(payload.measuredAvgValue),
    expectedMinValue: normalizeNumber(payload.expectedMinValue),
    expectedMaxValue: normalizeNumber(payload.expectedMaxValue),
    locationLatitude: normalizeNumber(payload.locationLatitude),
    locationLongitude: normalizeNumber(payload.locationLongitude),
    shipmentId: normalizeUuid(payload.shipmentId),
    segmentId: normalizeUuid(payload.segmentId),
    shipmentStatus: toStringValue(payload.shipmentStatus),
    notes: toStringValue(payload.notes),
  };
}

export function buildConditionBreachCanonicalPayload(breachId, payload) {
  const entries = { id: breachId };
  for (const field of BREACH_FIELDS) {
    entries[field] = payload[field] ?? EMPTY;
  }
  return stableStringify(entries);
}

export function computeConditionBreachHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
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
  // Ensure consistent type handling for all fields

  const payload = {
    packageId: record.package_id ?? record.packageId ?? null,
    messageId: record.message_id ?? record.messageId ?? null,
    sensorReadingId: record.sensor_reading_id ?? record.sensorReadingId ?? null,
    breachType: record.breach_type ?? record.breachType ?? null,
    severity: record.severity ?? null,
    breachStartTime: record.breach_start_time ?? record.breachStartTime ?? null,
    breachEndTime: record.breach_end_time ?? record.breachEndTime ?? null,
    durationSeconds: record.duration_seconds ?? record.durationSeconds ?? null,
    hasDataGaps:
      record.has_data_gaps === false
        ? ""
        : record.has_data_gaps ?? record.hasDataGaps ?? null,
    totalGapDurationSeconds:
      record.total_gap_duration_seconds ??
      record.totalGapDurationSeconds ??
      null,
    gapDetails: record.gap_details ?? record.gapDetails ?? null,
    breachCertainty: record.breach_certainty ?? record.breachCertainty ?? null,
    measuredMinValue:
      record.measured_min_value ?? record.measuredMinValue ?? null,
    measuredMaxValue:
      record.measured_max_value ?? record.measuredMaxValue ?? null,
    measuredAvgValue:
      record.measured_avg_value ?? record.measuredAvgValue ?? null,
    expectedMinValue:
      record.expected_min_value ?? record.expectedMinValue ?? null,
    expectedMaxValue:
      record.expected_max_value ?? record.expectedMaxValue ?? null,
    locationLatitude:
      record.location_latitude ?? record.locationLatitude ?? null,
    locationLongitude:
      record.location_longitude ?? record.locationLongitude ?? null,
    shipmentId: record.shipment_id ?? record.shipmentId ?? null,
    segmentId: record.segment_id ?? record.segmentId ?? null,
    shipmentStatus: record.shipment_status ?? record.shipmentStatus ?? null,
    notes: record.notes ?? null,
  };

  return payload;
}
