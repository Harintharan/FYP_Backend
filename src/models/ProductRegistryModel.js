// const pool = require("../config/db");

// module.exports = {
//   // 🔹 Create product
//   async createProduct(data) {
//     const result = await pool.query(
//       `INSERT INTO productRegistry
//        (product_id, product_uuid, product_name, product_category, batch_lot_id,
//         required_storage_temp, transport_route_plan_id, handling_instructions, expiry_date,
//         sensor_device_uuid, microprocessor_mac, sensor_types, qr_id,
//         wifi_ssid, wifi_password, manufacturer_uuid, origin_facility_addr,
//         product_hash, tx_hash, created_by, created_at, status)
//        VALUES ($1,$2,$3,$4,$5,
//                $6,$7,$8,$9,
//                $10,$11,$12,$13,
//                $14,$15,$16,$17,
//                $18,$19,$20,NOW(),$21)
//        RETURNING *`,
//       [
//         data.product_id,
//         data.productUUID,
//         data.productName,
//         data.productCategory,
//         data.batchLotId,
//         data.requiredStorageTemp,
//         data.transportRoutePlanId,
//         data.handlingInstructions,
//         data.expiryDate, // TIMESTAMP (not string)
//         data.sensorDeviceUUID,
//         data.microprocessorMac,
//         data.sensorTypes,
//         data.qrId,
//         data.wifiSSID,
//         data.wifiPassword,
//         data.manufacturerUUID,
//         data.originFacilityAddr,
//         data.product_hash,
//         data.tx_hash,
//         data.created_by,
//         data.status,
//       ]
//     );
//     return result.rows[0];
//   },

//   async updateProduct(id, data) {
//     const result = await pool.query(
//       `UPDATE productRegistry SET
//          product_uuid=$1, product_name=$2, product_category=$3, batch_lot_id=$4,
//          required_storage_temp=$5, transport_route_plan_id=$6, handling_instructions=$7, expiry_date=$8,
//          sensor_device_uuid=$9, microprocessor_mac=$10, sensor_types=$11, qr_id=$12,
//          wifi_ssid=$13, wifi_password=$14, manufacturer_uuid=$15, origin_facility_addr=$16,
//          product_hash=$17, tx_hash=$18, updated_by=$19, updated_at=NOW(), status=$20
//        WHERE id=$21 RETURNING *`,
//       [
//         data.productUUID,
//         data.productName,
//         data.productCategory,
//         data.batchLotId,
//         data.requiredStorageTemp,
//         data.transportRoutePlanId,
//         data.handlingInstructions,
//         data.expiryDate,
//         data.sensorDeviceUUID,
//         data.microprocessorMac,
//         data.sensorTypes,
//         data.qrId,
//         data.wifiSSID,
//         data.wifiPassword,
//         data.manufacturerUUID,
//         data.originFacilityAddr,
//         data.product_hash,
//         data.tx_hash,
//         data.updated_by,
//         data.status,
//         id,
//       ]
//     );
//     return result.rows[0];
//   },
//  // 🔹 Get product by DB id
//   async getProductById(id) {
//     const result = await pool.query(`SELECT * FROM productRegistry WHERE id=$1`, [id]);
//     return result.rows[0];
//   },

//   // 🔹 Get product by Blockchain product_id
//   async getByBlockchainId(product_id) {
//     const result = await pool.query(`SELECT * FROM productRegistry WHERE product_id=$1`, [product_id]);
//     return result.rows[0];
//   },

//   // 🔹 Get all products
//   async getAllProducts() {
//     const result = await pool.query(`SELECT * FROM productRegistry ORDER BY created_at DESC`);
//     return result.rows;
//   },

//   // 🔹 Delete product (if needed)
//   async deleteProduct(id) {
//     const result = await pool.query(`DELETE FROM productRegistry WHERE id=$1 RETURNING *`, [id]);
//     return result.rows[0];
//   }
// };
const pool = require("../config/db");

function normalizeDate(dateVal) {
  if (!dateVal) return "";
  return String(dateVal);  // ✅ don't convert with new Date(), just keep as-is
}


module.exports = {
  // 🔹 Create product
  async createProduct(data) {
    const result = await pool.query(
      `INSERT INTO product_registry
       (product_id, product_uuid, product_name, product_category, batch_lot_id,
        required_storage_temp, transport_route_plan_id, handling_instructions, expiry_date,
        sensor_device_uuid, microprocessor_mac, sensor_types, qr_id,
        wifi_ssid, wifi_password, manufacturer_uuid, origin_facility_addr,
        product_hash, tx_hash, created_by, created_at, status)
       VALUES ($1,$2,$3,$4,$5,
               $6,$7,$8,$9,
               $10,$11,$12,$13,
               $14,$15,$16,$17,
               $18,$19,$20,NOW(),$21)
       RETURNING *`,
      [
        data.product_id,
        data.productUUID,
        data.productName,
        data.productCategory,
        data.batchLotId,
        data.requiredStorageTemp,
        data.transportRoutePlanId,
        data.handlingInstructions,
        normalizeDate(data.expiryDate),  // ✅ force DATE only
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
        data.status,
      ]
    );
    return result.rows[0];
  },

  // 🔹 Update product by blockchain product_id
  async updateProduct(product_id, data) {
    const result = await pool.query(
      `UPDATE product_registry SET
         product_uuid=$1, product_name=$2, product_category=$3, batch_lot_id=$4,
         required_storage_temp=$5, transport_route_plan_id=$6, handling_instructions=$7, expiry_date=$8,
         sensor_device_uuid=$9, microprocessor_mac=$10, sensor_types=$11, qr_id=$12,
         wifi_ssid=$13, wifi_password=$14, manufacturer_uuid=$15, origin_facility_addr=$16,
         product_hash=$17, tx_hash=$18, updated_by=$19, updated_at=NOW(), status=$20
       WHERE product_id=$21 RETURNING *`,
      [
        data.productUUID,
        data.productName,
        data.productCategory,
        data.batchLotId,
        data.requiredStorageTemp,
        data.transportRoutePlanId,
        data.handlingInstructions,
        normalizeDate(data.expiryDate),  // ✅ normalize on update too
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
        data.status,
        product_id,
      ]
    );
    return result.rows[0];
  },

  // 🔹 Get product by blockchain product_id
  async getProductById(product_id) {
    const result = await pool.query(
      `SELECT * FROM product_registry WHERE product_id=$1`,
      [product_id]
    );
    return result.rows[0];
  },

  // 🔹 Get all products
  async getAllProducts() {
    const result = await pool.query(
      `SELECT * FROM product_registry ORDER BY created_at DESC`
    );
    return result.rows;
  }
};
