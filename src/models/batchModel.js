import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertBatch(
  {
    id,
    productId,
    manufacturerUUID,
    facility,
    productionStartTime = null,
    productionEndTime = null,
    quantityProduced,
    expiryDate = null,
    batchHash,
    txHash = null,
    createdBy = null,
    pinataCid = null,
    pinataPinnedAt = null,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `INSERT INTO batches (
        id,
        product_id,
        manufacturer_uuid,
        facility,
        production_start_time,
        production_end_time,
        quantity_produced,
        expiry_date,
        batch_hash,
        tx_hash,
        created_by,
        pinata_cid,
        pinata_pinned_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13
      )`,
    [
      id,
      productId,
      manufacturerUUID,
      facility,
      productionStartTime,
      productionEndTime,
      quantityProduced,
      expiryDate,
      batchHash,
      txHash,
      createdBy,
      pinataCid,
      pinataPinnedAt,
    ]
  );

  return findBatchById(id, dbClient);
}

export async function updateBatch(
  {
    id,
    productId,
    manufacturerUUID,
    facility,
    productionStartTime = null,
    productionEndTime = null,
    quantityProduced,
    expiryDate = null,
    batchHash,
    txHash,
    updatedBy = null,
    pinataCid = null,
    pinataPinnedAt = null,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE batches
        SET product_id = $2::uuid,
            manufacturer_uuid = $3::uuid,
            facility = $4,
            production_start_time = $5,
            production_end_time = $6,
            quantity_produced = $7,
            expiry_date = $8,
            batch_hash = $9,
            tx_hash = $10,
            updated_by = $11,
            pinata_cid = $12,
            pinata_pinned_at = $13,
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [
      id,
      productId,
      manufacturerUUID,
      facility,
      productionStartTime,
      productionEndTime,
      quantityProduced,
      expiryDate,
      batchHash,
      txHash,
      updatedBy,
      pinataCid,
      pinataPinnedAt,
    ]
  );

  return findBatchById(id, dbClient);
}

export async function deleteBatchById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  await exec(`DELETE FROM batches WHERE id = $1::uuid`, [id]);
}

export async function findBatchById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT b.*,
            p.name AS product_name
       FROM batches b
       LEFT JOIN products p
         ON p.id = b.product_id
      WHERE b.id = $1::uuid
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listBatchesByManufacturerUuid(manufacturerUuid, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT b.*,
            p.name AS product_name
       FROM batches b
       LEFT JOIN products p
         ON p.id = b.product_id
      WHERE b.manufacturer_uuid = $1::uuid
      ORDER BY b.created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}
