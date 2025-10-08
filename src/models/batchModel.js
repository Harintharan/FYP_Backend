import { query } from "../db.js";

export async function createBatch(data) {
  const { rows } = await query(
    `INSERT INTO batches
     (batch_id, product_category, manufacturer_uuid, facility, production_window, quantity_produced,
      release_status, batch_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     RETURNING *`,
    [
      data.batch_id,
      data.product_category,
      data.manufacturer_uuid,
      data.facility,
      data.production_window,
      data.quantity_produced,
      data.release_status,
      data.batch_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateBatch(id, data) {
  const { rows } = await query(
    `UPDATE batches SET
        product_category=$1, manufacturer_uuid=$2, facility=$3,
        production_window=$4, quantity_produced=$5, release_status=$6,
        batch_hash=$7, tx_hash=$8, updated_by=$9,
        pinata_cid=$10, pinata_pinned_at=$11,
        updated_at=NOW()
      WHERE id=$12 RETURNING *`,
    [
      data.product_category,
      data.manufacturer_uuid,
      data.facility,
      data.production_window,
      data.quantity_produced,
      data.release_status,
      data.batch_hash,
      data.tx_hash,
      data.updated_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      id,
    ]
  );
  return rows[0];
}

export async function getBatchById(id) {
  const { rows } = await query(`SELECT * FROM batches WHERE id=$1`, [id]);
  return rows[0];
}

export async function getBatchesByManufacturerUuid(manufacturerUuid) {
  const { rows } = await query(
    `SELECT id, batch_id, product_category, manufacturer_uuid, facility,
            production_window, quantity_produced, release_status, batch_hash,
            tx_hash, created_by, updated_by, pinata_cid, pinata_pinned_at,
            created_at, updated_at
       FROM batches
      WHERE manufacturer_uuid = $1
      ORDER BY created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}
