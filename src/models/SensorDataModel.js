import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertSensorData({
  id,
  packageId,
  macAddress,
  ipAddress,
  sensorData,
  requestSendTimestamp,
  requestReceivedTimestamp,
  payloadHash,
  txHash,
  createdBy,
  pinataCid,
  pinataPinnedAt,
  createdAt,
  updatedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO sensor_data (
       id,
       package_id,
       mac_address,
       ip_address,
       sensor_data,
       payload_hash,
       tx_hash,
       created_by,
       request_send_timestamp,
       request_received_timestamp,
       created_at,
       updated_at,
       pinata_cid,
       pinata_pinned_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::jsonb,
       $6,
       $7,
       $8,
       $9,
       COALESCE($10, NOW()),
       COALESCE($11, NOW()),
       COALESCE($12, NOW()),
       $13,
       $14
     )
     RETURNING *`,
    [
      id,
      packageId,
      macAddress ?? null,
      ipAddress ?? null,
      JSON.stringify(sensorData ?? []),
      payloadHash,
      txHash,
      createdBy ?? null,
      requestSendTimestamp ?? null,
      requestReceivedTimestamp ?? null,
      createdAt ?? null,
      updatedAt ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findSensorDataById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM sensor_data
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listSensorDataByPackageId(packageId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM sensor_data
      WHERE package_id = $1
      ORDER BY request_received_timestamp DESC`,
    [packageId]
  );
  return rows;
}
