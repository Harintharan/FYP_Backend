import { query } from "../db.js";

export async function createShipment(data) {
  const { rows } = await query(
    `INSERT INTO shipment_registry
       (shipment_id, manufacturer_uuid, destination_party_uuid,
        shipment_items, shipment_hash, tx_hash, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING *`,
    [
      data.shipment_id,
      data.manufacturerUUID,
      data.destinationPartyUUID,
      JSON.stringify(data.shipmentItems),
      data.shipment_hash,
      data.tx_hash,
      data.created_by,
    ]
  );
  return rows[0];
}

export async function updateShipment(shipment_id, data) {
  const { rows } = await query(
    `UPDATE shipment_registry SET
         manufacturer_uuid=$1,
         destination_party_uuid=$2,
         shipment_items=$3,
         shipment_hash=$4,
         tx_hash=$5,
         updated_by=$6,
         updated_at=NOW()
       WHERE shipment_id=$7 RETURNING *`,
    [
      data.manufacturerUUID,
      data.destinationPartyUUID,
      JSON.stringify(data.shipmentItems),
      data.shipment_hash,
      data.tx_hash,
      data.updated_by,
      shipment_id,
    ]
  );
  return rows[0];
}

export async function getShipmentById(shipment_id) {
  const { rows } = await query(
    `SELECT * FROM shipment_registry WHERE shipment_id=$1`,
    [shipment_id]
  );
  return rows[0];
}

export async function getAllShipments() {
  const { rows } = await query(
    `SELECT * FROM shipment_registry ORDER BY created_at DESC`
  );
  return rows;
}
