/**
 * Utilities for processing sensor data
 * Handles GPS coordinate population, data parsing, etc.
 */

/**
 * Parse GPS data string into latitude and longitude
 * @param {string} data - GPS data in format "lat,lng"
 * @returns {{ lat: number, lng: number }}
 */
export function parseGPS(data) {
  if (!data || typeof data !== "string") {
    return { lat: null, lng: null };
  }

  const parts = data.split(",").map((s) => s.trim());
  if (parts.length !== 2) {
    return { lat: null, lng: null };
  }

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lng)) {
    return { lat: null, lng: null };
  }

  return { lat, lng };
}

/**
 * Find nearest GPS reading for a given timestamp
 * @param {number} timestamp - Unix timestamp
 * @param {Array} gpsReadings - Array of GPS readings with timestamp, latitude, longitude
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function findNearestGPS(timestamp, gpsReadings) {
  if (!gpsReadings || gpsReadings.length === 0) {
    return null;
  }

  let nearest = gpsReadings[0];
  let minDiff = Math.abs(timestamp - nearest.timestamp);

  for (const gps of gpsReadings) {
    const diff = Math.abs(timestamp - gps.timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = gps;
    }
  }

  return {
    latitude: nearest.latitude,
    longitude: nearest.longitude,
  };
}

/**
 * Process sensor readings to populate GPS coordinates for all readings
 * @param {Array} sensorReadings - Array of raw sensor readings
 * @returns {Array} - Processed readings with GPS coordinates
 */
export function populateGPSCoordinates(sensorReadings) {
  // Extract and parse GPS readings
  const gpsReadings = sensorReadings
    .filter((r) => r.sensorType === "GPS")
    .map((r) => {
      const { lat, lng } = parseGPS(r.data);
      return {
        timestamp: r.timestamp,
        latitude: lat,
        longitude: lng,
      };
    })
    .filter((r) => r.latitude !== null && r.longitude !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Process all readings
  return sensorReadings.map((reading) => {
    if (reading.sensorType === "GPS") {
      // GPS reading - use its own coordinates
      const { lat, lng } = parseGPS(reading.data);
      return {
        ...reading,
        latitude: lat,
        longitude: lng,
      };
    } else {
      // Non-GPS reading - find nearest GPS
      const nearest = findNearestGPS(reading.timestamp, gpsReadings);
      return {
        ...reading,
        latitude: nearest?.latitude || null,
        longitude: nearest?.longitude || null,
      };
    }
  });
}

/**
 * Parse sensor data value based on sensor type
 * @param {string} sensorType - Type of sensor
 * @param {string} data - Raw data value
 * @returns {{ valueNumber: number|null, valueText: string|null, unit: string|null }}
 */
export function parseSensorValue(sensorType, data) {
  const result = {
    valueNumber: null,
    valueText: null,
    unit: null,
  };

  if (!data) {
    return result;
  }

  const normalized = sensorType.toLowerCase();

  // Temperature sensors
  if (normalized.includes("temp")) {
    const num = parseFloat(data);
    if (!isNaN(num)) {
      result.valueNumber = num;
      result.unit = "C"; // Assuming Celsius
    }
    return result;
  }

  // Humidity sensors
  if (normalized.includes("humid")) {
    const num = parseFloat(data);
    if (!isNaN(num)) {
      result.valueNumber = num;
      result.unit = "%";
    }
    return result;
  }

  // Pressure sensors
  if (normalized.includes("press")) {
    const num = parseFloat(data);
    if (!isNaN(num)) {
      result.valueNumber = num;
      result.unit = "Pa";
    }
    return result;
  }

  // Door/Lock sensors (text values)
  if (normalized.includes("door") || normalized.includes("lock")) {
    result.valueText = String(data).trim();
    return result;
  }

  // GPS - don't parse here (handled separately)
  if (normalized.includes("gps")) {
    result.valueText = String(data);
    return result;
  }

  // Default: try to parse as number, fallback to text
  const num = parseFloat(data);
  if (!isNaN(num)) {
    result.valueNumber = num;
  } else {
    result.valueText = String(data);
  }

  return result;
}

/**
 * Convert Unix timestamp to Date object
 * @param {number|string} timestamp - Unix timestamp (seconds or milliseconds)
 * @returns {Date}
 */
export function parseTimestamp(timestamp) {
  if (timestamp instanceof Date) {
    return timestamp;
  }

  const num = typeof timestamp === "number" ? timestamp : parseFloat(timestamp);

  // Convert to milliseconds if needed (< 1e12 means seconds)
  const millis = num < 1e12 ? num * 1000 : num;

  return new Date(millis);
}

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} - Grouped object
 */
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}
