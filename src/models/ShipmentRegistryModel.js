// const pool = require("../config/db");

// module.exports = {
//   async createShipment(data) {
//     const result = await pool.query(
//       `INSERT INTO shipment_registry
//        (shipment_id, manufacturer_uuid, destination_party_uuid,
//         handover_checkpoints, shipment_items,
//         shipment_hash, tx_hash, created_by, created_at)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
//        RETURNING *`,
//       [
//         data.shipment_id,
//         data.manufacturerUUID,
//         data.destinationPartyUUID,
//         JSON.stringify(data.handoverCheckpoints), // ✅ array → JSONB
//         JSON.stringify(data.shipmentItems),
//         data.shipment_hash,
//         data.tx_hash,
//         data.created_by,
//       ]
//     );
//     return result.rows[0];
//   },

//   async updateShipment(shipment_id, data) {
//   const result = await pool.query(
//     `UPDATE shipment_registry SET
//        manufacturer_uuid=$1, 
//        destination_party_uuid=$2,
//        handover_checkpoints=$3,
//        shipment_items=$4,
//        shipment_hash=$5, 
//        tx_hash=$6, 
//        updated_by=$7, 
//        updated_at=NOW()
//      WHERE shipment_id=$8
//      RETURNING *`,
//     [
//       data.manufacturerUUID,
//       data.destinationPartyUUID,
//       JSON.stringify(data.handoverCheckpoints), // must match merged key
//       JSON.stringify(data.shipmentItems),
//       data.shipment_hash,
//       data.tx_hash,
//       data.updated_by,
//       shipment_id,
//     ]
//   );
//   return result.rows[0];
// }
// ,

//   async getShipmentById(shipment_id) {
//     const result = await pool.query(
//       `SELECT * FROM shipment_registry WHERE shipment_id=$1`,
//       [shipment_id]
//     );
//     return result.rows[0];
//   },

//   async getAllShipments() {
//     const result = await pool.query(
//       `SELECT * FROM shipment_registry ORDER BY created_at DESC`
//     );
//     return result.rows;
//   },
//   async searchByProductUUID(uuid) {
//   const result = await pool.query(
//     `SELECT * 
//      FROM shipment_registry
//      WHERE EXISTS (
//        SELECT 1
//        FROM jsonb_array_elements(shipment_items) AS item
//        WHERE item->>'product_uuid' = $1
//      )`,
//     [uuid]
//   );
//   return result.rows;
// }

// };

const pool = require("../config/db");

module.exports = {



  async createShipment(data) {
  const result = await pool.query(
    `INSERT INTO shipment_registry
       (shipment_id, manufacturer_uuid, destination_party_uuid,
        shipment_items, shipment_hash, tx_hash, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING *`,
    [
      data.shipment_id,
      data.manufacturerUUID,
      data.destinationPartyUUID,
      JSON.stringify(data.shipmentItems),
      data.shipment_hash,
      data.tx_hash,
      data.created_by,
    ]
  );
  return result.rows[0];
},

  async updateShipment(shipment_id, data) {
  const result = await pool.query(
    `UPDATE shipment_registry SET
         manufacturer_uuid=$1,
         destination_party_uuid=$2,
         shipment_items=$3,
         shipment_hash=$4,
         tx_hash=$5,
         updated_by=$6,
         updated_at=NOW()
       WHERE shipment_id=$7 RETURNING *`,
    [
      data.manufacturerUUID,
      data.destinationPartyUUID,
      JSON.stringify(data.shipmentItems),
      data.shipment_hash,
      data.tx_hash,
      data.updated_by,
      shipment_id,
    ]
  );
  return result.rows[0];
},

  async getShipmentById(shipment_id) {
  const result = await pool.query(
    `SELECT * FROM shipment_registry WHERE shipment_id=$1`,
    [shipment_id]
  );
  return result.rows[0];
},

  async getAllShipments() {
  const result = await pool.query(
    `SELECT * FROM shipment_registry ORDER BY created_at DESC`
  );
  return result.rows;
}
};
