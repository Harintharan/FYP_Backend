import { query } from "../db.js";

function normalizeDate(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function insertProduct({
  id,
  productName,
  productCategory,
  batchId,
  requiredStorageTemp,
  transportRoutePlanId,
  handlingInstructions,
  expiryDate,
  sensorDeviceUUID,
  microprocessorMac,
  sensorTypes,
  qrId,
  wifiSSID,
  encryptedWifiPassword,
  manufacturerUUID,
  originFacilityAddr,
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
       required_storage_temp,
       transport_route_plan_id,
       handling_instructions,
       expiry_date,
       sensor_device_uuid,
       microprocessor_mac,
       sensor_types,
       qr_id,
       wifi_ssid,
       wifi_password,
       manufacturer_uuid,
       origin_facility_addr,
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
       $6,$7,$8,$9,
       $10,$11,$12,$13,
       $14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22
     )
     RETURNING *`,
    [
      id,
      productName,
      productCategory,
      batchId ?? null,
      requiredStorageTemp ?? null,
      transportRoutePlanId ?? null,
      handlingInstructions ?? null,
      normalizeDate(expiryDate),
      sensorDeviceUUID ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      qrId ?? null,
      wifiSSID ?? null,
      encryptedWifiPassword ?? null,
      manufacturerUUID,
      originFacilityAddr ?? null,
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
  requiredStorageTemp,
  transportRoutePlanId,
  handlingInstructions,
  expiryDate,
  sensorDeviceUUID,
  microprocessorMac,
  sensorTypes,
  qrId,
  wifiSSID,
  encryptedWifiPassword,
  manufacturerUUID,
  originFacilityAddr,
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
            required_storage_temp = $5,
            transport_route_plan_id = $6,
            handling_instructions = $7,
            expiry_date = $8,
            sensor_device_uuid = $9,
            microprocessor_mac = $10,
            sensor_types = $11,
            qr_id = $12,
            wifi_ssid = $13,
            wifi_password = $14,
            manufacturer_uuid = $15,
            origin_facility_addr = $16,
            product_hash = $17,
            tx_hash = $18,
            updated_by = $19,
            pinata_cid = $20,
            pinata_pinned_at = $21,
            updated_at = NOW(),
            status = $22
      WHERE id = $1
      RETURNING *`,
    [
      id,
      productName,
      productCategory,
      batchId ?? null,
      requiredStorageTemp ?? null,
      transportRoutePlanId ?? null,
      handlingInstructions ?? null,
      normalizeDate(expiryDate),
      sensorDeviceUUID ?? null,
      microprocessorMac ?? null,
      sensorTypes ?? null,
      qrId ?? null,
      wifiSSID ?? null,
      encryptedWifiPassword ?? null,
      manufacturerUUID,
      originFacilityAddr ?? null,
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
