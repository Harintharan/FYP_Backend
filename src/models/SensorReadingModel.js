import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertSensorReading(
  {
    id,
    messageId,
    packageId,
    sensorType,
    rawData,
    valueNumber,
    valueText,
    latitude,
    longitude,
    sensorTimestampUnix,
    sensorTimestamp,
    unit,
    createdAt,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO sensor_readings (
       id,
       message_id,
       package_id,
       sensor_type,
       raw_data,
       value_number,
       value_text,
       latitude,
       longitude,
       sensor_timestamp_unix,
       sensor_timestamp,
       unit,
       created_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12,
       COALESCE($13, NOW())
     )
     RETURNING *`,
    [
      id,
      messageId,
      packageId,
      sensorType,
      rawData,
      valueNumber ?? null,
      valueText ?? null,
      latitude ?? null,
      longitude ?? null,
      sensorTimestampUnix,
      sensorTimestamp,
      unit ?? null,
      createdAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function bulkInsertSensorReadings(readings, dbClient) {
  if (!readings || readings.length === 0) {
    return [];
  }

  const exec = resolveExecutor(dbClient);

  const values = readings
    .map((r, idx) => {
      const base = idx * 13;
      return `(
      $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
      $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10},
      $${base + 11}, $${base + 12}, COALESCE($${base + 13}, NOW())
    )`;
    })
    .join(", ");

  const params = readings.flatMap((r) => [
    r.id,
    r.messageId,
    r.packageId,
    r.sensorType,
    r.rawData,
    r.valueNumber ?? null,
    r.valueText ?? null,
    r.latitude ?? null,
    r.longitude ?? null,
    r.sensorTimestampUnix,
    r.sensorTimestamp,
    r.unit ?? null,
    r.createdAt ?? null,
  ]);

  const { rows } = await exec(
    `INSERT INTO sensor_readings (
       id, message_id, package_id, sensor_type, raw_data,
       value_number, value_text, latitude, longitude, sensor_timestamp_unix,
       sensor_timestamp, unit, created_at
     )
     VALUES ${values}
     RETURNING *`,
    params
  );

  return rows;
}

export async function findSensorReadingById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM sensor_readings WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listSensorReadingsByMessageId(messageId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM sensor_readings
      WHERE message_id = $1
      ORDER BY sensor_timestamp ASC`,
    [messageId]
  );
  return rows;
}

export async function listSensorReadingsByPackageId(
  packageId,
  { sensorType, startTime, endTime } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const params = [packageId];
  const conditions = ["package_id = $1"];

  if (sensorType) {
    params.push(sensorType);
    conditions.push(`sensor_type = $${params.length}`);
  }

  if (startTime) {
    params.push(startTime);
    conditions.push(`sensor_timestamp >= $${params.length}`);
  }

  if (endTime) {
    params.push(endTime);
    conditions.push(`sensor_timestamp <= $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const { rows } = await exec(
    `SELECT *
       FROM sensor_readings
      WHERE ${whereClause}
      ORDER BY sensor_timestamp ASC`,
    params
  );
  return rows;
}
