import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertSensorDataBreach({
  id,
  sensorDataId,
  sensorType,
  reading,
  note,
  detectedAt,
  createdAt,
  payloadHash,
  txHash,
  createdBy,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO sensor_data_breach (
       id,
       sensor_data_id,
       sensor_type,
       reading,
       note,
       detected_at,
       created_at,
       payload_hash,
       tx_hash,
       created_by,
       pinata_cid,
       pinata_pinned_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       COALESCE($6, NOW()),
       COALESCE($7, NOW()),
       $8,
       $9,
       $10,
       $11,
       $12
     )
     RETURNING *`,
    [
      id,
      sensorDataId,
      sensorType,
      reading ?? null,
      note ?? null,
      detectedAt ?? null,
      createdAt ?? null,
      payloadHash,
      txHash,
      createdBy ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findSensorDataBreachById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM sensor_data_breach
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listSensorDataBreachesBySensorDataId(sensorDataId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM sensor_data_breach
      WHERE sensor_data_id = $1
      ORDER BY detected_at DESC, created_at DESC`,
    [sensorDataId]
  );
  return rows;
}
