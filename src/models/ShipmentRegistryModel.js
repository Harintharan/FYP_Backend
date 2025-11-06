import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function createShipment(data, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO shipment_registry
       (id, manufacturer_uuid, consumer_uuid, status,
        shipment_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING *`,
    [
      data.id,
      data.manufacturerUUID,
      data.consumerUUID,
      data.status ?? "PENDING",
      data.shipment_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateShipment(id, data, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE shipment_registry SET
         manufacturer_uuid=$1,
         consumer_uuid=$2,
         status=$3,
         shipment_hash=$4,
         tx_hash=$5,
         updated_by=$6,
         pinata_cid=$7,
         pinata_pinned_at=$8,
         updated_at=NOW()
       WHERE id=$9 RETURNING *`,
    [
      data.manufacturerUUID,
      data.consumerUUID,
      data.status ?? null,
      data.shipment_hash,
      data.tx_hash,
      data.updated_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      id,
    ]
  );
  return rows[0];
}

export async function getShipmentById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM shipment_registry WHERE id=$1`,
    [id]
  );
  return rows[0];
}

export async function getAllShipments(dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM shipment_registry ORDER BY created_at DESC`
  );
  return rows;
}

export async function listShipmentsByManufacturerId(
  manufacturerId,
  { status } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const hasStatus = typeof status === "string" && status.length > 0;
  const params = hasStatus ? [manufacturerId, status] : [manufacturerId];
  const statusClause = hasStatus ? "AND sr.status = $2" : "";
  const { rows } = await exec(
    `SELECT sr.*,
            u.payload -> 'identification' ->> 'legalName' AS consumer_legal_name
       FROM shipment_registry sr
       LEFT JOIN users u
         ON u.id::text = sr.consumer_uuid::text
      WHERE sr.manufacturer_uuid = $1
        ${statusClause}
      ORDER BY sr.created_at DESC`,
    params
  );
  return rows;
}
