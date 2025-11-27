/**
 * Daily Summary Service
 * Aggregates sensor data and breaches into daily summaries
 */

import { query } from "../db.js";
import { upsertDailyConditionSummary } from "../models/DailyConditionSummaryModel.js";
import { groupBy } from "../utils/sensorDataUtils.js";

/**
 * Get highest severity from a list of severities
 */
function getHighestSeverity(breaches) {
  if (!breaches || breaches.length === 0) {
    return null;
  }

  const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  let highest = "LOW";
  let highestValue = 0;

  for (const breach of breaches) {
    const value = severityOrder[breach.severity] || 0;
    if (value > highestValue) {
      highestValue = value;
      highest = breach.severity;
    }
  }

  return highest;
}

/**
 * Update daily condition summary for a specific package and date
 */
export async function updateDailyConditionSummary(packageId, date, dbClient) {
  // Get all sensor readings for this package on this date
  const readingsResult = await query(
    `SELECT 
      sensor_type,
      value_number,
      sensor_timestamp
    FROM sensor_readings
    WHERE package_id = $1
      AND DATE(sensor_timestamp) = $2
    ORDER BY sensor_timestamp`,
    [packageId, date]
  );

  const readings = readingsResult.rows;

  // Get all breaches for this package on this date
  const breachesResult = await query(
    `SELECT *
    FROM condition_breaches
    WHERE package_id = $1
      AND DATE(breach_start_time) = $2
    ORDER BY breach_start_time`,
    [packageId, date]
  );

  const breaches = breachesResult.rows;

  if (readings.length === 0) {
    // No data for this day
    return;
  }

  // Group readings by sensor type
  const bySensorType = groupBy(readings, "sensor_type");

  // Create summary for each sensor type
  for (const [sensorType, typeReadings] of Object.entries(bySensorType)) {
    // Filter breaches for this sensor type
    const typeBreaches = breaches.filter((b) =>
      b.breach_type.toLowerCase().includes(sensorType.toLowerCase())
    );

    // Filter numeric readings (skip GPS, Door, etc.)
    const numericReadings = typeReadings.filter((r) => r.value_number !== null);

    const summary = {
      packageId,
      sensorType,
      summaryDate: date,

      // Reading stats
      totalReadingsCount: typeReadings.length,
      firstReadingTime: typeReadings[0]?.sensor_timestamp,
      lastReadingTime: typeReadings[typeReadings.length - 1]?.sensor_timestamp,

      // Value stats (for numeric sensors only)
      minValue:
        numericReadings.length > 0
          ? Math.min(...numericReadings.map((r) => parseFloat(r.value_number)))
          : null,
      maxValue:
        numericReadings.length > 0
          ? Math.max(...numericReadings.map((r) => parseFloat(r.value_number)))
          : null,
      avgValue:
        numericReadings.length > 0
          ? numericReadings.reduce(
              (sum, r) => sum + parseFloat(r.value_number),
              0
            ) / numericReadings.length
          : null,

      // Breach stats
      breachCount: typeBreaches.length,
      firstBreachTime: typeBreaches[0]?.breach_start_time || null,
      lastBreachTime:
        typeBreaches[typeBreaches.length - 1]?.breach_start_time || null,
      maxSeverity: getHighestSeverity(typeBreaches),

      // Values during breaches
      minValueDuringBreaches:
        typeBreaches.length > 0 &&
        typeBreaches.some((b) => b.measured_min_value !== null)
          ? Math.min(
              ...typeBreaches
                .filter((b) => b.measured_min_value !== null)
                .map((b) => parseFloat(b.measured_min_value))
            )
          : null,
      maxValueDuringBreaches:
        typeBreaches.length > 0 &&
        typeBreaches.some((b) => b.measured_max_value !== null)
          ? Math.max(
              ...typeBreaches
                .filter((b) => b.measured_max_value !== null)
                .map((b) => parseFloat(b.measured_max_value))
            )
          : null,

      // Status
      status: typeBreaches.length > 0 ? "BREACH_PRESENT" : "OK",
    };

    await upsertDailyConditionSummary(summary, dbClient);
  }
}

/**
 * Update daily summaries for a range of dates
 */
export async function updateDailyConditionSummariesForPackage(
  packageId,
  startDate,
  endDate,
  dbClient
) {
  const summaries = [];

  // Get unique dates that have data
  const datesResult = await query(
    `SELECT DISTINCT DATE(sensor_timestamp) as date
     FROM sensor_readings
     WHERE package_id = $1
       AND DATE(sensor_timestamp) >= $2
       AND DATE(sensor_timestamp) <= $3
     ORDER BY date`,
    [packageId, startDate, endDate]
  );

  for (const row of datesResult.rows) {
    await updateDailyConditionSummary(packageId, row.date, dbClient);
    summaries.push(row.date);
  }

  return summaries;
}
