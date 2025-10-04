import { query } from "../db.js";

export async function createCheckpoint(data) {
  const { rows } = await query(
    `INSERT INTO checkpoint_registry
       (checkpoint_id, checkpoint_uuid, name, address, latitude, longitude,
        owner_uuid, owner_type, checkpoint_type,
        checkpoint_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,
               $7,$8,$9,
               $10,$11,$12,$13,$14,NOW())
       RETURNING *`,
    [
      data.checkpoint_id,
      data.checkpointUUID,
      data.name,
      data.address,
      data.latitude,
      data.longitude,
      data.ownerUUID,
      data.ownerType,
      data.checkpointType,
      data.checkpoint_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateCheckpoint(checkpoint_id, data) {
  const { rows } = await query(
    `UPDATE checkpoint_registry SET
         checkpoint_uuid=$1, name=$2, address=$3, latitude=$4, longitude=$5,
         owner_uuid=$6, owner_type=$7, checkpoint_type=$8,
         checkpoint_hash=$9, tx_hash=$10, updated_by=$11,
         pinata_cid=$12, pinata_pinned_at=$13,
         updated_at=NOW()
       WHERE checkpoint_id=$14 RETURNING *`,
    [
      data.checkpointUUID,
      data.name,
      data.address,
      data.latitude,
      data.longitude,
      data.ownerUUID,
      data.ownerType,
      data.checkpointType,
      data.checkpoint_hash,
      data.tx_hash,
      data.updated_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      checkpoint_id,
    ]
  );
  return rows[0];
}

export async function getCheckpointById(checkpoint_id) {
  const { rows } = await query(
    `SELECT * FROM checkpoint_registry WHERE checkpoint_id=$1`,
    [checkpoint_id]
  );
  return rows[0];
}

export async function getAllCheckpoints() {
  const { rows } = await query(
    `SELECT * FROM checkpoint_registry ORDER BY created_at DESC`
  );
  return rows;
}
