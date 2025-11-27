import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function upsertDailyConditionSummary(
  {
    packageId,
    sensorType,
    summaryDate,
    totalReadingsCount,
    firstReadingTime,
    lastReadingTime,
    minValue,
    maxValue,
    avgValue,
    breachCount,
    firstBreachTime,
    lastBreachTime,
    maxSeverity,
    minValueDuringBreaches,
    maxValueDuringBreaches,
    status,
    notes,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO daily_condition_summary (
       package_id, sensor_type, summary_date, total_readings_count, first_reading_time,
       last_reading_time, min_value, max_value, avg_value, breach_count,
       first_breach_time, last_breach_time, max_severity, min_value_during_breaches, max_value_during_breaches,
       status, notes, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15,
       $16, $17, NOW(), NOW()
     )
     ON CONFLICT (package_id, sensor_type, summary_date)
     DO UPDATE SET
       total_readings_count = EXCLUDED.total_readings_count,
       first_reading_time = EXCLUDED.first_reading_time,
       last_reading_time = EXCLUDED.last_reading_time,
       min_value = EXCLUDED.min_value,
       max_value = EXCLUDED.max_value,
       avg_value = EXCLUDED.avg_value,
       breach_count = EXCLUDED.breach_count,
       first_breach_time = EXCLUDED.first_breach_time,
       last_breach_time = EXCLUDED.last_breach_time,
       max_severity = EXCLUDED.max_severity,
       min_value_during_breaches = EXCLUDED.min_value_during_breaches,
       max_value_during_breaches = EXCLUDED.max_value_during_breaches,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [
      packageId,
      sensorType,
      summaryDate,
      totalReadingsCount ?? 0,
      firstReadingTime ?? null,
      lastReadingTime ?? null,
      minValue ?? null,
      maxValue ?? null,
      avgValue ?? null,
      breachCount ?? 0,
      firstBreachTime ?? null,
      lastBreachTime ?? null,
      maxSeverity ?? null,
      minValueDuringBreaches ?? null,
      maxValueDuringBreaches ?? null,
      status ?? "OK",
      notes ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findDailyConditionSummary(
  packageId,
  sensorType,
  summaryDate,
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM daily_condition_summary
      WHERE package_id = $1
        AND sensor_type = $2
        AND summary_date = $3
      LIMIT 1`,
    [packageId, sensorType, summaryDate]
  );
  return rows[0] ?? null;
}

export async function listDailyConditionSummariesByPackage(
  packageId,
  { startDate, endDate } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const params = [packageId];
  const conditions = ["package_id = $1"];

  if (startDate) {
    params.push(startDate);
    conditions.push(`summary_date >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`summary_date <= $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const { rows } = await exec(
    `SELECT *
       FROM daily_condition_summary
      WHERE ${whereClause}
      ORDER BY summary_date DESC, sensor_type ASC`,
    params
  );
  return rows;
}
