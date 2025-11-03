import { ethers } from "ethers";
import { stableStringify } from "../utils/canonicalize.js";

const EMPTY = "";

function toString(value) {
  if (value === undefined || value === null) {
    return EMPTY;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? EMPTY : value.toISOString();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value).trim();
}

function normalizeUuid(value) {
  const str = toString(value);
  return str ? str.toLowerCase() : EMPTY;
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

export function normalizeSensorDataBreachPayload(payload, overrides = {}) {
  const merged = { ...payload, ...overrides };
  return {
    sensorDataId: normalizeUuid(merged.sensorDataId),
    sensorType: toString(merged.sensorType),
    reading: toString(merged.reading),
    note: toString(merged.note),
    detectedAt: normalizeTimestamp(merged.detectedAt),
    createdAt: normalizeTimestamp(merged.createdAt),
  };
}

export function buildSensorDataBreachCanonicalPayload(breachId, payload) {
  return stableStringify({
    id: breachId,
    sensorDataId: payload.sensorDataId ?? EMPTY,
    sensorType: payload.sensorType ?? EMPTY,
    reading: payload.reading ?? EMPTY,
    note: payload.note ?? EMPTY,
    detectedAt: payload.detectedAt ?? EMPTY,
    createdAt: payload.createdAt ?? EMPTY,
  });
}

export function computeSensorDataBreachHashFromCanonical(canonical) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function prepareSensorDataBreachPersistence(breachId, payload, overrides = {}) {
  const normalized = normalizeSensorDataBreachPayload(payload, overrides);
  const canonical = buildSensorDataBreachCanonicalPayload(breachId, normalized);
  const payloadHash = computeSensorDataBreachHashFromCanonical(canonical);
  return { normalized, canonical, payloadHash };
}

