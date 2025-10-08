import { query } from "../db.js";

function normalizeDate(dateVal) {
  if (!dateVal) return "";
  return String(dateVal);
}

export async function createProduct(data) {
  const { rows } = await query(
    `INSERT INTO product_registry
       (product_id, product_uuid, product_name, product_category, batch_id,
        required_storage_temp, transport_route_plan_id, handling_instructions, expiry_date,
        sensor_device_uuid, microprocessor_mac, sensor_types, qr_id,
        wifi_ssid, wifi_password, manufacturer_uuid, origin_facility_addr,
        product_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at, status)
       VALUES ($1,$2,$3,$4,$5,
               $6,$7,$8,$9,
               $10,$11,$12,$13,
               $14,$15,$16,$17,
               $18,$19,$20,$21,$22,NOW(),$23)
       RETURNING *`,
    [
      data.product_id,
      data.productUUID,
      data.productName,
      data.productCategory,
      data.batchId ?? null,
      data.requiredStorageTemp,
      data.transportRoutePlanId,
      data.handlingInstructions,
      normalizeDate(data.expiryDate),
      data.sensorDeviceUUID,
      data.microprocessorMac,
      data.sensorTypes,
      data.qrId,
      data.wifiSSID,
      data.wifi_password,
      data.manufacturerUUID,
      data.originFacilityAddr,
      data.product_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      data.status,
    ]
  );
  return rows[0];
}

export async function updateProduct(product_id, data) {
  const { rows } = await query(
    `UPDATE product_registry SET
         product_uuid=$1, product_name=$2, product_category=$3, batch_id=$4,
         required_storage_temp=$5, transport_route_plan_id=$6, handling_instructions=$7, expiry_date=$8,
         sensor_device_uuid=$9, microprocessor_mac=$10, sensor_types=$11, qr_id=$12,
         wifi_ssid=$13, wifi_password=$14, manufacturer_uuid=$15, origin_facility_addr=$16,
         product_hash=$17, tx_hash=$18, updated_by=$19,
         pinata_cid=$20, pinata_pinned_at=$21,
         updated_at=NOW(), status=$22
       WHERE product_id=$23 RETURNING *`,
    [
      data.productUUID,
      data.productName,
      data.productCategory,
      data.batchId ?? null,
      data.requiredStorageTemp,
      data.transportRoutePlanId,
      data.handlingInstructions,
      normalizeDate(data.expiryDate),
      data.sensorDeviceUUID,
      data.microprocessorMac,
      data.sensorTypes,
      data.qrId,
      data.wifiSSID,
      data.wifi_password,
      data.manufacturerUUID,
      data.originFacilityAddr,
      data.product_hash,
      data.tx_hash,
      data.updated_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      data.status,
      product_id,
    ]
  );
  return rows[0];
}

export async function getProductById(product_id) {
  const { rows } = await query(
    `SELECT * FROM product_registry WHERE product_id=$1`,
    [product_id]
  );
  return rows[0];
}

export async function getAllProducts() {
  const { rows } = await query(
    `SELECT * FROM product_registry ORDER BY created_at DESC`
  );
  return rows;
}
