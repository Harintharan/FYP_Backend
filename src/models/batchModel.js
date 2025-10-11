import { query } from "../db.js";

export async function insertBatch({
  id,
  productCategory,
  manufacturerUUID,
  facility,
  productionWindow,
  quantityProduced,
  releaseStatus,
  batchHash,
  txHash = null,
  createdBy = null,
  pinataCid = null,
  pinataPinnedAt = null,
}) {
  const { rows } = await query(
    `INSERT INTO batches (
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
        pinata_pinned_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12
      )
      RETURNING *`,
    [
      id,
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProduced,
      releaseStatus,
      batchHash,
      txHash,
      createdBy,
      pinataCid,
      pinataPinnedAt,
    ]
  );

  return rows[0];
}

export async function updateBatch({
  id,
  productCategory,
  manufacturerUUID,
  facility,
  productionWindow,
  quantityProduced,
  releaseStatus,
  batchHash,
  txHash,
  updatedBy = null,
  pinataCid = null,
  pinataPinnedAt = null,
}) {
  const { rows } = await query(
    `UPDATE batches
        SET product_category = $2,
            manufacturer_uuid = $3,
            facility = $4,
            production_window = $5,
            quantity_produced = $6,
            release_status = $7,
            batch_hash = $8,
            tx_hash = $9,
            updated_by = $10,
            pinata_cid = $11,
            pinata_pinned_at = $12,
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`,
    [
      id,
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProduced,
      releaseStatus,
      batchHash,
      txHash,
      updatedBy,
      pinataCid,
      pinataPinnedAt,
    ]
  );

  return rows[0];
}

export async function deleteBatchById(id) {
  await query(`DELETE FROM batches WHERE id = $1::uuid`, [id]);
}

export async function findBatchById(id) {
  const { rows } = await query(
    `SELECT *
       FROM batches
      WHERE id = $1::uuid
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listBatchesByManufacturerUuid(manufacturerUuid) {
  const { rows } = await query(
    `SELECT id,
            product_category,
            manufacturer_uuid,
            facility,
            production_window,
            quantity_produced,
            release_status,
            batch_hash,
            tx_hash,
            created_by,
            updated_by,
            pinata_cid,
            pinata_pinned_at,
            created_at,
            updated_at
       FROM batches
      WHERE manufacturer_uuid = $1
      ORDER BY created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}
