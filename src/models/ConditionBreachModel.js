import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertConditionBreach(
  {
    id,
    packageId,
    messageId,
    sensorReadingId,
    breachType,
    severity,
    breachStartTime,
    breachEndTime,
    durationSeconds,
    hasDataGaps,
    totalGapDurationSeconds,
    gapDetails,
    breachCertainty,
    measuredMinValue,
    measuredMaxValue,
    measuredAvgValue,
    expectedMinValue,
    expectedMaxValue,
    locationLatitude,
    locationLongitude,
    checkpointId,
    shipmentId,
    shipmentStatus,
    payloadHash,
    txHash,
    pinataCid,
    pinataPinnedAt,
    notes,
    resolved,
    resolvedAt,
    resolvedBy,
    createdBy,
    createdAt,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO condition_breaches (
       id, package_id, message_id, sensor_reading_id, breach_type,
       severity, breach_start_time, breach_end_time, duration_seconds, has_data_gaps,
       total_gap_duration_seconds, gap_details, breach_certainty, measured_min_value, measured_max_value,
       measured_avg_value, expected_min_value, expected_max_value, location_latitude, location_longitude,
       checkpoint_id, shipment_id, shipment_status, payload_hash, tx_hash,
       pinata_cid, pinata_pinned_at, notes, resolved, resolved_at,
       resolved_by, created_by, created_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25,
       $26, $27, $28, $29, $30,
       $31, $32, COALESCE($33, NOW())
     )
     RETURNING *`,
    [
      id,
      packageId,
      messageId ?? null,
      sensorReadingId ?? null,
      breachType,
      severity,
      breachStartTime,
      breachEndTime ?? null,
      durationSeconds ?? null,
      hasDataGaps ?? false,
      totalGapDurationSeconds ?? null,
      gapDetails ? JSON.stringify(gapDetails) : null,
      breachCertainty ?? "CONFIRMED",
      measuredMinValue ?? null,
      measuredMaxValue ?? null,
      measuredAvgValue ?? null,
      expectedMinValue ?? null,
      expectedMaxValue ?? null,
      locationLatitude ?? null,
      locationLongitude ?? null,
      checkpointId ?? null,
      shipmentId ?? null,
      shipmentStatus ?? null,
      payloadHash,
      txHash,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
      notes ?? null,
      resolved ?? false,
      resolvedAt ?? null,
      resolvedBy ?? null,
      createdBy ?? null,
      createdAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findConditionBreachById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM condition_breaches WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listConditionBreachesByPackageId(
  packageId,
  { resolved, severity } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const params = [packageId];
  const conditions = ["package_id = $1"];

  if (resolved !== undefined && resolved !== null) {
    params.push(resolved);
    conditions.push(`resolved = $${params.length}`);
  }

  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const { rows } = await exec(
    `SELECT *
       FROM condition_breaches
      WHERE ${whereClause}
      ORDER BY breach_start_time DESC`,
    params
  );
  return rows;
}

export async function updateConditionBreachResolved(
  id,
  { resolved, resolvedAt, resolvedBy },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE condition_breaches
        SET resolved = $2,
            resolved_at = COALESCE($3, NOW()),
            resolved_by = $4
      WHERE id = $1
      RETURNING *`,
    [id, resolved, resolvedAt ?? null, resolvedBy ?? null]
  );
  return rows[0] ?? null;
}
