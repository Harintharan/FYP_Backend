import { query } from "../db.js";

export async function createBatch(data) {
  const {
    id,
    product_category,
    manufacturer_uuid,
    facility,
    production_window,
    quantity_produced,
    release_status,
    batch_hash = null,
    tx_hash = null,
    created_by = null,
    pinata_cid = null,
    pinata_pinned_at = null,
  } = data;

  const { rows } = await query(
    `INSERT INTO batches
       (id, product_category, manufacturer_uuid, facility, production_window, quantity_produced,
        release_status, batch_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      id,
      product_category,
      manufacturer_uuid,
      facility,
      production_window,
      quantity_produced,
      release_status,
      batch_hash,
      tx_hash,
      created_by,
      pinata_cid,
      pinata_pinned_at,
    ]
  );
  return rows[0];
}

export async function updateBatch(id, data) {
  const {
    product_category,
    manufacturer_uuid,
    facility,
    production_window,
    quantity_produced,
    release_status,
    batch_hash,
    tx_hash,
    updated_by,
    pinata_cid = null,
    pinata_pinned_at = null,
  } = data;

  const { rows } = await query(
    `UPDATE batches SET
        product_category=$2,
        manufacturer_uuid=$3,
        facility=$4,
        production_window=$5,
        quantity_produced=$6,
        release_status=$7,
        batch_hash=$8,
        tx_hash=$9,
        updated_by=$10,
        pinata_cid=$11,
        pinata_pinned_at=$12,
        updated_at=NOW()
      WHERE id=$1::uuid
      RETURNING *`,
    [
      id,
      product_category,
      manufacturer_uuid,
      facility,
      production_window,
      quantity_produced,
      release_status,
      batch_hash,
      tx_hash,
      updated_by,
      pinata_cid,
      pinata_pinned_at,
    ]
  );
  return rows[0];
}

export async function updateBatchOnChainMetadata(
  id,
  { batch_hash, tx_hash, created_by, pinata_cid = null, pinata_pinned_at = null }
) {
  const { rows } = await query(
    `UPDATE batches
        SET batch_hash = $2,
            tx_hash = $3,
            created_by = COALESCE($4, created_by),
            pinata_cid = $5,
            pinata_pinned_at = $6
      WHERE id = $1::uuid
      RETURNING *`,
    [id, batch_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at]
  );
  return rows[0];
}

export async function deleteBatchById(id) {
  await query(`DELETE FROM batches WHERE id = $1::uuid`, [id]);
}

export async function getBatchById(id) {
  const { rows } = await query(`SELECT * FROM batches WHERE id=$1::uuid`, [id]);
  return rows[0];
}

export async function getBatchesByManufacturerUuid(manufacturerUuid) {
  const { rows } = await query(
    `SELECT id, product_category, manufacturer_uuid, facility,
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
