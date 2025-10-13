import { query } from "../db.js";

export async function insertProduct({
  id,
  productName,
  productCategory,
  batchId,
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
}) {
  const { rows } = await query(
    `INSERT INTO product_registry (
       id,
       product_name,
       product_category,
       batch_id,
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
      $11,$12,$13,$14,
      NOW(),$15
    )
     RETURNING *`,
    [
      id,
      productName,
      productCategory,
      batchId ?? null,
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
}) {
  const { rows } = await query(
    `UPDATE product_registry
        SET product_name = $2,
            product_category = $3,
            batch_id = $4,
            microprocessor_mac = $5,
            sensor_types = $6,
            wifi_ssid = $7,
            wifi_password = $8,
            manufacturer_uuid = $9,
            product_hash = $10,
            tx_hash = $11,
            updated_by = $12,
            pinata_cid = $13,
            pinata_pinned_at = $14,
            updated_at = NOW(),
            status = $15
      WHERE id = $1
      RETURNING *`,
    [
      id,
      productName,
      productCategory,
      batchId ?? null,
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

export async function findProductById(id) {
  const { rows } = await query(
    `SELECT * FROM product_registry WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listProductsByManufacturerUuid(manufacturerUuid) {
  const { rows } = await query(
    `SELECT *
       FROM product_registry
      WHERE LOWER(manufacturer_uuid) = LOWER($1)
      ORDER BY created_at DESC`,
    [manufacturerUuid]
  );
  return rows;
}
