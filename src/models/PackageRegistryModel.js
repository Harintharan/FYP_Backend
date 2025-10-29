import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertPackage({
  id,
  batchId,
  shipmentId,
  quantity,
  microprocessorMac,
  sensorTypes,
  manufacturerUUID,
  productHash,
  txHash,
  createdBy,
  status,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO package_registry (
       id,
        batch_id,
        shipment_id,
        quantity,
        microprocessor_mac,
        sensor_types,
       manufacturer_uuid,
       product_hash,
       tx_hash,
       created_by,
       pinata_cid,
       pinata_pinned_at,
     created_at,
     status
   )
       VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,$10,
       $11,$12,NOW(),$13
     )
     RETURNING *`,
       [
      id,
      batchId ?? null,
      shipmentId ?? null,
      quantity ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      manufacturerUUID,
      productHash,
      txHash,
      createdBy,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
      status ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function updatePackageRecord(id, {
  batchId,
  shipmentId,
  quantity,
  microprocessorMac,
  sensorTypes,
  manufacturerUUID,
  productHash,
  txHash,
  updatedBy,
  status,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE package_registry
        SET batch_id = $2,
            shipment_id = $3,
            quantity = $4,
            microprocessor_mac = $5,
            sensor_types = $6,
            manufacturer_uuid = $7,
            product_hash = $8,
            tx_hash = $9,
            updated_by = $10,
            pinata_cid = $11,
            pinata_pinned_at = $12,
            updated_at = NOW(),
            status = COALESCE($13, status)
      WHERE id = $1
      RETURNING *`,
    [
      id,
      batchId ?? null,
      shipmentId ?? null,
      quantity ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      manufacturerUUID,
      productHash,
      txHash,
      updatedBy ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
      status ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findPackageById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM package_registry WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listPackagesByManufacturerUuid(manufacturerUuid, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM package_registry
      WHERE LOWER(manufacturer_uuid) = LOWER($1)
      ORDER BY created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}

export async function listPackagesByShipmentUuid(shipmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id, shipment_id, quantity
       FROM package_registry
      WHERE shipment_id = $1`,
    [shipmentId]
  );
  return rows;
}

export async function deletePackageById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rowCount } = await exec(
    `DELETE FROM package_registry WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}

export async function summarizePackagesByShipmentId(shipmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT
        pc.name AS product_category_name,
        p.name AS product_name,
        p.required_start_temp,
        p.required_end_temp,
        COALESCE(SUM(COALESCE(pr.quantity, 0)), 0)::int AS total_quantity
      FROM package_registry pr
      LEFT JOIN batches b
        ON pr.batch_id = b.id
      LEFT JOIN products p
        ON b.product_id = p.id
      LEFT JOIN product_categories pc
        ON p.product_category_id = pc.id
     WHERE pr.shipment_id = $1
     GROUP BY
        pc.name,
        p.name,
        p.required_start_temp,
        p.required_end_temp
     ORDER BY
        p.name NULLS LAST,
        pc.name NULLS LAST`,
    [shipmentId]
  );
  return rows;
}

export async function assignPackageToShipment(packageId, shipmentId, quantity, dbClient) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE package_registry
        SET shipment_id = $2::uuid,
            quantity = COALESCE($3::int, quantity),
            status = CASE
              WHEN $2::uuid IS NOT NULL THEN 'PACKAGE_ALLOCATED'::package_status
              ELSE status
            END,
            updated_at = NOW()
      WHERE id = $1`,
    [packageId, shipmentId ?? null, quantity]
  );
}

export async function clearPackagesFromShipment(
  shipmentId,
  keepPackageIds = [],
  dbClient
) {
  if (!shipmentId) {
    return;
  }

  const exec = resolveExecutor(dbClient);
  const keepSet = new Set(
    Array.isArray(keepPackageIds)
      ? keepPackageIds.map((id) => id.toLowerCase())
      : []
  );

  if (keepSet.size === 0) {
    await exec(
      `UPDATE package_registry
          SET shipment_id = NULL,
              status = 'PACKAGE_READY_FOR_SHIPMENT'::package_status,
              updated_at = NOW()
        WHERE shipment_id = $1::uuid`,
      [shipmentId]
    );
    return;
  }

  const { rows } = await exec(
    `SELECT id FROM package_registry WHERE shipment_id = $1::uuid`,
    [shipmentId]
  );

  for (const row of rows) {
    if (!keepSet.has(row.id.toLowerCase())) {
      await exec(
        `UPDATE package_registry
            SET shipment_id = NULL,
                status = 'PACKAGE_READY_FOR_SHIPMENT'::package_status,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id]
      );
    }
  }
}
