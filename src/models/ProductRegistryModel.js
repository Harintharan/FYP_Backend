import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertProduct({
  id,
  productName,
  productCategory,
  batchId,
  shipmentId,
  quantity,
  microprocessorMac,
  sensorTypes,
  wifiSSID,
  encryptedWifiPassword,
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
    `INSERT INTO product_registry (
       id,
       product_name,
       product_category,
        batch_id,
        shipment_id,
        quantity,
        microprocessor_mac,
        sensor_types,
        wifi_ssid,
       wifi_password,
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
       $11,$12,$13,$14,$15,
       $16,NOW(),$17
     )
     RETURNING *`,
       [
      id,
      productName,
      productCategory,
      batchId ?? null,
      shipmentId ?? null,
      quantity ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      wifiSSID ?? null,
      encryptedWifiPassword ?? null,
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

export async function updateProductRecord(id, {
  productName,
  productCategory,
  batchId,
  shipmentId,
  quantity,
  microprocessorMac,
  sensorTypes,
  wifiSSID,
  encryptedWifiPassword,
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
    `UPDATE product_registry
        SET product_name = $2,
            product_category = $3,
            batch_id = $4,
            shipment_id = $5,
            quantity = $6,
            microprocessor_mac = $7,
            sensor_types = $8,
            wifi_ssid = $9,
            wifi_password = $10,
            manufacturer_uuid = $11,
            product_hash = $12,
            tx_hash = $13,
            updated_by = $14,
            pinata_cid = $15,
            pinata_pinned_at = $16,
            updated_at = NOW(),
            status = $17
      WHERE id = $1
      RETURNING *`,
    [
      id,
      productName,
      productCategory,
      batchId ?? null,
      shipmentId ?? null,
      quantity ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      wifiSSID ?? null,
      encryptedWifiPassword ?? null,
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

export async function findProductById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM product_registry WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listProductsByManufacturerUuid(manufacturerUuid, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM product_registry
      WHERE LOWER(manufacturer_uuid) = LOWER($1)
      ORDER BY created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}

export async function listProductsByShipmentUuid(shipmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id, shipment_id, quantity
       FROM product_registry
      WHERE shipment_id = $1`,
    [shipmentId]
  );
  return rows;
}

export async function assignProductToShipment(productId, shipmentId, quantity, dbClient) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE product_registry
        SET shipment_id = $2::uuid,
            quantity = COALESCE($3::int, quantity),
            status = CASE
              WHEN $2::uuid IS NOT NULL THEN 'PRODUCT_ALLOCATED'::product_status
              ELSE status
            END,
            updated_at = NOW()
      WHERE id = $1`,
    [productId, shipmentId ?? null, quantity]
  );
}

export async function clearProductsFromShipment(
  shipmentId,
  keepProductIds = [],
  dbClient
) {
  if (!shipmentId) {
    return;
  }

  const exec = resolveExecutor(dbClient);
  const keepSet = new Set(
    Array.isArray(keepProductIds)
      ? keepProductIds.map((id) => id.toLowerCase())
      : []
  );

  if (keepSet.size === 0) {
    await exec(
      `UPDATE product_registry
          SET shipment_id = NULL,
              status = 'PRODUCT_READY_FOR_SHIPMENT'::product_status,
              updated_at = NOW()
        WHERE shipment_id = $1::uuid`,
      [shipmentId]
    );
    return;
  }

  const { rows } = await exec(
    `SELECT id FROM product_registry WHERE shipment_id = $1::uuid`,
    [shipmentId]
  );

  for (const row of rows) {
    if (!keepSet.has(row.id.toLowerCase())) {
      await exec(
        `UPDATE product_registry
            SET shipment_id = NULL,
                status = 'PRODUCT_READY_FOR_SHIPMENT'::product_status,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id]
      );
    }
  }
}
