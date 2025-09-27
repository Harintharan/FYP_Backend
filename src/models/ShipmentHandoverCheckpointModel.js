import { query } from "../db.js";

export async function addCheckpoint(data) {
  const { rows } = await query(
    `INSERT INTO shipment_handover_checkpoints
       (shipment_id, start_checkpoint_id, end_checkpoint_id,
        estimated_arrival_date, time_tolerance, expected_ship_date, required_action)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
    [
      data.shipment_id,
      data.start_checkpoint_id,
      data.end_checkpoint_id,
      data.estimated_arrival_date,
      data.time_tolerance,
      data.expected_ship_date,
      data.required_action,
    ]
  );
  return rows[0];
}

export async function getByShipment(shipment_id) {
  const { rows } = await query(
    `SELECT shc.*,
            sc1.name AS start_name,
            sc2.name AS end_name
       FROM shipment_handover_checkpoints shc
       JOIN checkpoint_registry sc1 ON shc.start_checkpoint_id = sc1.checkpoint_id
       JOIN checkpoint_registry sc2 ON shc.end_checkpoint_id = sc2.checkpoint_id
       WHERE shc.shipment_id=$1`,
    [shipment_id]
  );
  return rows;
}

export async function deleteByShipment(shipment_id) {
  await query(
    `DELETE FROM shipment_handover_checkpoints WHERE shipment_id=$1`,
    [shipment_id]
  );
}
