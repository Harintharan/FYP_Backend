import { query } from "../db.js";

export async function createShipment(data) {
  const { rows } = await query(
    `INSERT INTO shipment_registry
       (id, manufacturer_uuid, consumer_uuid,
        shipment_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
    [
      data.id,
      data.manufacturerUUID,
      data.consumerUUID,
      data.shipment_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateShipment(id, data) {
  const { rows } = await query(
    `UPDATE shipment_registry SET
         manufacturer_uuid=$1,
         consumer_uuid=$2,
         shipment_hash=$3,
         tx_hash=$4,
         updated_by=$5,
         pinata_cid=$6,
         pinata_pinned_at=$7,
         updated_at=NOW()
       WHERE id=$8 RETURNING *`,
    [
      data.manufacturerUUID,
      data.consumerUUID,
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

export async function getShipmentById(id) {
  const { rows } = await query(
    `SELECT * FROM shipment_registry WHERE id=$1`,
    [id]
  );
  return rows[0];
}

export async function getAllShipments() {
  const { rows } = await query(
    `SELECT * FROM shipment_registry ORDER BY created_at DESC`
  );
  return rows;
}
