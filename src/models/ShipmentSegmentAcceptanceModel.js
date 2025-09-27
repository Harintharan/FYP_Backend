// const pool = require("../config/db");

// module.exports = {
//   async createSegmentAcceptance(data) {
//     const result = await pool.query(
//       `INSERT INTO shipmentSegmentAcceptance
//        (acceptance_id, shipment_id, segment_start_checkpoint_id, segment_end_checkpoint_id,
//         assigned_role, assigned_party_uuid, estimated_pickup_time, estimated_delivery_time,
//         shipment_items, acceptance_timestamp, digital_signature,
//         acceptance_hash, tx_hash, created_by, created_at)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
//        RETURNING *`,
//       [
//         data.acceptance_id,
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         JSON.stringify(data.shipment_items),
//         data.acceptance_timestamp,
//         data.digital_signature,
//         data.acceptance_hash,
//         data.tx_hash,
//         data.created_by
//       ]
//     );
//     return result.rows[0];
//   },

//   async updateSegmentAcceptance(acceptance_id, data) {
//     const result = await pool.query(
//       `UPDATE shipmentSegmentAcceptance SET
//          shipment_id=$1, segment_start_checkpoint_id=$2, segment_end_checkpoint_id=$3,
//          assigned_role=$4, assigned_party_uuid=$5, estimated_pickup_time=$6,
//          estimated_delivery_time=$7, shipment_items=$8,
//          acceptance_timestamp=$9, digital_signature=$10,
//          acceptance_hash=$11, tx_hash=$12, updated_by=$13, updated_at=NOW()
//        WHERE acceptance_id=$14 RETURNING *`,
//       [
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         JSON.stringify(data.shipment_items),
//         data.acceptance_timestamp,
//         data.digital_signature,
//         data.acceptance_hash,
//         data.tx_hash,
//         data.updated_by,
//         acceptance_id
//       ]
//     );
//     return result.rows[0];
//   },

//   async getSegmentAcceptanceById(acceptance_id) {
//     const result = await pool.query(
//       `SELECT * FROM shipmentSegmentAcceptance WHERE acceptance_id=$1`,
//       [acceptance_id]
//     );
//     return result.rows[0];
//   }
// };

// const pool = require("../config/db");

// module.exports = {
//   async createSegmentAcceptance(data) {
//     const result = await pool.query(
//       `INSERT INTO shipment_segment_acceptance
//        (acceptance_id, shipment_id, segment_start_checkpoint_id, segment_end_checkpoint_id,
//         assigned_role, assigned_party_uuid, estimated_pickup_time, estimated_delivery_time,
//         shipment_items, acceptance_timestamp, digital_signature,
//         acceptance_hash, tx_hash, created_by, created_at)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
//        RETURNING *`,
//       [
//         data.acceptance_id,
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         JSON.stringify(data.shipment_items),   // always JSON
//         data.acceptance_timestamp,
//         data.digital_signature,
//         data.acceptance_hash,
//         data.tx_hash,
//         data.created_by
//       ]
//     );
//     return result.rows[0];
//   },

//   async updateSegmentAcceptance(acceptance_id, data) {
//     const result = await pool.query(
//       `UPDATE shipment_segment_acceptance SET
//          shipment_id=$1, segment_start_checkpoint_id=$2, segment_end_checkpoint_id=$3,
//          assigned_role=$4, assigned_party_uuid=$5, estimated_pickup_time=$6,
//          estimated_delivery_time=$7, shipment_items=$8,
//          acceptance_timestamp=$9, digital_signature=$10,
//          acceptance_hash=$11, tx_hash=$12, updated_by=$13, updated_at=NOW()
//        WHERE acceptance_id=$14 RETURNING *`,
//       [
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         JSON.stringify(data.shipment_items),
//         data.acceptance_timestamp,
//         data.digital_signature,
//         data.acceptance_hash,
//         data.tx_hash,
//         data.updated_by,
//         acceptance_id
//       ]
//     );
//     return result.rows[0];
//   },

//   async getSegmentAcceptanceById(acceptance_id) {
//     const result = await pool.query(
//       `SELECT * FROM shipment_segment_acceptance WHERE acceptance_id=$1`,
//       [acceptance_id]
//     );
//     if (result.rows.length === 0) return null;

//     const row = result.rows[0];
//     row.shipment_items = typeof row.shipment_items === "string"
//       ? JSON.parse(row.shipment_items)
//       : row.shipment_items;

//     return row;
//   }
// };

const pool = require("../config/db");

module.exports = {
  async createSegmentAcceptance(data) {
    const result = await pool.query(
      `INSERT INTO shipment_segment_acceptance
       (acceptance_id, shipment_id, segment_start_checkpoint_id, segment_end_checkpoint_id,
        assigned_role, assigned_party_uuid, estimated_pickup_time, estimated_delivery_time,
        shipment_items, acceptance_timestamp, digital_signature,
        acceptance_hash, tx_hash, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       RETURNING *`,
      [
        data.acceptance_id,
        data.shipment_id,
        data.segment_start_checkpoint_id,
        data.segment_end_checkpoint_id,
        data.assigned_role,
        data.assigned_party_uuid,
        data.estimated_pickup_time,   // ✅ stored raw ISO string
        data.estimated_delivery_time, // ✅ stored raw ISO string
        JSON.stringify(data.shipment_items), // ✅ JSON
        data.acceptance_timestamp,    // ✅ stored raw ISO string
        data.digital_signature,
        data.acceptance_hash,
        data.tx_hash,
        data.created_by
      ]
    );
    return result.rows[0];
  },

  async updateSegmentAcceptance(acceptance_id, data) {
    const result = await pool.query(
      `UPDATE shipment_segment_acceptance SET
         shipment_id=$1, segment_start_checkpoint_id=$2, segment_end_checkpoint_id=$3,
         assigned_role=$4, assigned_party_uuid=$5, estimated_pickup_time=$6,
         estimated_delivery_time=$7, shipment_items=$8,
         acceptance_timestamp=$9, digital_signature=$10,
         acceptance_hash=$11, tx_hash=$12, updated_by=$13, updated_at=NOW()
       WHERE acceptance_id=$14 RETURNING *`,
      [
        data.shipment_id,
        data.segment_start_checkpoint_id,
        data.segment_end_checkpoint_id,
        data.assigned_role,
        data.assigned_party_uuid,
        data.estimated_pickup_time,   // ✅ keep string
        data.estimated_delivery_time, // ✅ keep string
        JSON.stringify(data.shipment_items),
        data.acceptance_timestamp,
        data.digital_signature,
        data.acceptance_hash,
        data.tx_hash,
        data.updated_by,
        acceptance_id
      ]
    );
    return result.rows[0];
  },

  async getSegmentAcceptanceById(acceptance_id) {
    const result = await pool.query(
      `SELECT * FROM shipment_segment_acceptance WHERE acceptance_id=$1`,
      [acceptance_id]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    row.shipment_items = typeof row.shipment_items === "string"
      ? JSON.parse(row.shipment_items)
      : row.shipment_items;

    return row;
  },


  async getAllSegmentAcceptances() {
  const result = await pool.query(`SELECT * FROM shipment_segment_acceptance ORDER BY id ASC`);
  return result.rows.map((row) => {
    row.shipment_items =
      typeof row.shipment_items === "string"
        ? JSON.parse(row.shipment_items)
        : row.shipment_items;
    return row;
  });
}

};

