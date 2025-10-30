import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";

const EMPTY = "";

function toString(value) {
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : value.toISOString();
  }
  return String(value).trim();
}

function normalizeUuid(value) {
  const str = toString(value);
  return str ? str.toLowerCase() : EMPTY;
}

function normalizeMacAddress(value) {
  const str = toString(value);
  return str ? str.toUpperCase() : EMPTY;
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
  const str = toString(value);
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

function normalizeSensorReading(reading) {
  return {
    sensorType: toString(reading.sensorType),
    data: toString(reading.data),
    timestamp: normalizeTimestamp(reading.timestamp),
  };
}

export function normalizeSensorDataPayload(payload, overrides = {}) {
  const merged = { ...payload, ...overrides };
  const readings = Array.isArray(merged.sensorData) ? merged.sensorData : [];

  return {
    packageId: normalizeUuid(merged.packageId),
    manufacturerUUID: normalizeUuid(merged.manufacturerUUID),
    macAddress: normalizeMacAddress(merged.macAddress),
    sensorData: readings.map(normalizeSensorReading),
    requestSendTimestamp: normalizeTimestamp(merged.requestSendTimestamp),
    requestReceivedTimestamp: normalizeTimestamp(merged.requestReceivedTimestamp),
  };
}

export function buildSensorDataCanonicalPayload(sensorDataId, payload) {
  return stableStringify({
    id: sensorDataId,
    packageId: payload.packageId ?? EMPTY,
    macAddress: payload.macAddress ?? EMPTY,
    requestSendTimestamp: payload.requestSendTimestamp ?? EMPTY,
    requestReceivedTimestamp: payload.requestReceivedTimestamp ?? EMPTY,
    sensorData: payload.sensorData ?? [],
  });
}

export function computeSensorDataHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function prepareSensorDataPersistence(sensorDataId, payload, overrides = {}) {
  const normalized = normalizeSensorDataPayload(payload, overrides);
  const canonical = buildSensorDataCanonicalPayload(sensorDataId, normalized);
  const payloadHash = computeSensorDataHashFromCanonical(canonical);
  return { normalized, canonical, payloadHash };
}
