/**
 * Configuration for breach detection logic
 * Defines thresholds and tolerances for different sensor types
 */

export const BREACH_DETECTION_CONFIG = {
  Temperature: {
    expectedInterval: 10, // Expected reading every 10 seconds
    maxGapTolerance: 60, // Split breach if gap > 60s
    gracePeriod: 30, // Assume ended if gap > 30s and next reading OK
    minBreachDuration: 0, // Report all temperature breaches (even instant)
  },

  Humidity: {
    expectedInterval: 10,
    maxGapTolerance: 60,
    gracePeriod: 30,
    minBreachDuration: 0,
  },

  Pressure: {
    expectedInterval: 10,
    maxGapTolerance: 60,
    gracePeriod: 30,
    minBreachDuration: 0,
  },

  Door: {
    expectedInterval: 10,
    maxGapTolerance: 300, // Door status changes rarely, 5 min tolerance
    gracePeriod: 60,
    minBreachDuration: 0, // Report all door tamper events
  },

  Lock: {
    expectedInterval: 10,
    maxGapTolerance: 300,
    gracePeriod: 60,
    minBreachDuration: 0,
  },

  GPS: {
    expectedInterval: 10,
    maxGapTolerance: 120, // GPS can have longer gaps
    gracePeriod: 60,
    minBreachDuration: 0,
  },
};

/**
 * Severity calculation thresholds
 * Used to determine breach severity based on deviation from expected range
 */
export const SEVERITY_THRESHOLDS = {
  Temperature: {
    CRITICAL: 10, // Deviation > 10°C
    HIGH: 5, // Deviation > 5°C
    MEDIUM: 2, // Deviation > 2°C
    LOW: 0, // Any deviation
  },

  Humidity: {
    CRITICAL: 40, // Deviation > 40%
    HIGH: 20, // Deviation > 20%
    MEDIUM: 10, // Deviation > 10%
    LOW: 0,
  },

  Door: {
    CRITICAL: 0, // Any door opening is critical
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  },
};

/**
 * Get configuration for a specific sensor type
 */
export function getBreachConfig(sensorType) {
  return (
    BREACH_DETECTION_CONFIG[sensorType] || {
      expectedInterval: 10,
      maxGapTolerance: 60,
      gracePeriod: 30,
      minBreachDuration: 0,
    }
  );
}

/**
 * Get severity thresholds for a specific sensor type
 */
export function getSeverityThresholds(sensorType) {
  return (
    SEVERITY_THRESHOLDS[sensorType] || {
      CRITICAL: 10,
      HIGH: 5,
      MEDIUM: 2,
      LOW: 0,
    }
  );
}
