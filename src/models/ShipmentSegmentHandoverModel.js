import { query } from "../db.js";

export async function createHandover(data) {
  const { rows } = await query(
    `INSERT INTO shipment_segment_handover
       (handover_id, shipment_id, acceptance_id, segment_start_checkpoint_id, segment_end_checkpoint_id,
        from_party_uuid, to_party_uuid, handover_timestamp, gps_lat, gps_lon, quantity_transferred,
        from_party_signature, to_party_signature, handover_hash, tx_hash, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       RETURNING *`,
    [
      data.handover_id,
      data.shipment_id,
      data.acceptance_id,
      data.segment_start_checkpoint_id,
      data.segment_end_checkpoint_id,
      data.from_party_uuid,
      data.to_party_uuid,
      data.handover_timestamp,
      data.gps_lat,
      data.gps_lon,
      data.quantity_transferred,
      data.from_party_signature,
      data.to_party_signature,
      data.handover_hash,
      data.tx_hash,
      data.created_by,
    ]
  );
  return rows[0];
}

export async function updateHandover(handover_id, data) {
  const { rows } = await query(
    `UPDATE shipment_segment_handover SET
         shipment_id=$1, acceptance_id=$2, segment_start_checkpoint_id=$3, segment_end_checkpoint_id=$4,
         from_party_uuid=$5, to_party_uuid=$6, handover_timestamp=$7, gps_lat=$8, gps_lon=$9,
         quantity_transferred=$10, from_party_signature=$11, to_party_signature=$12,
         handover_hash=$13, tx_hash=$14, updated_by=$15, updated_at=NOW()
       WHERE handover_id=$16 RETURNING *`,
    [
      data.shipment_id,
      data.acceptance_id,
      data.segment_start_checkpoint_id,
      data.segment_end_checkpoint_id,
      data.from_party_uuid,
      data.to_party_uuid,
      data.handover_timestamp,
      data.gps_lat,
      data.gps_lon,
      data.quantity_transferred,
      data.from_party_signature,
      data.to_party_signature,
      data.handover_hash,
      data.tx_hash,
      data.updated_by,
      handover_id,
    ]
  );
  return rows[0];
}

export async function getHandoverById(handover_id) {
  const { rows } = await query(
    `SELECT * FROM shipment_segment_handover WHERE handover_id=$1`,
    [handover_id]
  );
  return rows.length ? rows[0] : null;
}

export async function getAllHandovers() {
  const { rows } = await query(
    `SELECT * FROM shipment_segment_handover ORDER BY id DESC`
  );
  return rows;
}
