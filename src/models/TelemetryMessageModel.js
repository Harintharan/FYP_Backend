import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertTelemetryMessage(
  {
    id,
    packageId,
    macAddress,
    ipAddress,
    requestSendTimestamp,
    requestReceivedTimestamp,
    payloadHash,
    txHash,
    pinataCid,
    pinataPinnedAt,
    createdBy,
    readingCount,
    createdAt,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO telemetry_messages (
       id,
       package_id,
       mac_address,
       ip_address,
       request_send_timestamp,
       request_received_timestamp,
       payload_hash,
       tx_hash,
       pinata_cid,
       pinata_pinned_at,
       created_by,
       reading_count,
       created_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       COALESCE($6, NOW()),
       $7, $8, $9, $10,
       $11, $12,
       COALESCE($13, NOW())
     )
     RETURNING *`,
    [
      id,
      packageId,
      macAddress ?? null,
      ipAddress ?? null,
      requestSendTimestamp ?? null,
      requestReceivedTimestamp ?? null,
      payloadHash,
      txHash,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
      createdBy ?? null,
      readingCount ?? 0,
      createdAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findTelemetryMessageById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM telemetry_messages WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listTelemetryMessagesByPackageId(packageId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM telemetry_messages
      WHERE package_id = $1
      ORDER BY request_received_timestamp DESC`,
    [packageId]
  );
  return rows;
}

export async function updateTelemetryMessageReadingCount(id, count, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE telemetry_messages
        SET reading_count = $2
      WHERE id = $1
      RETURNING *`,
    [id, count]
  );
  return rows[0] ?? null;
}
