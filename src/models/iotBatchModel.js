// const pool = require("../config/db");

// module.exports = {
//   async createBatch({ product_id, readings, batch_hash, tx_hash }) {
//     const result = await pool.query(
//       `INSERT INTO iot_batches (product_id, readings, batch_hash, tx_hash) 
//        VALUES ($1, $2, $3, $4) RETURNING *`,
//       [product_id, JSON.stringify(readings), batch_hash, tx_hash]
//     );
//     return result.rows[0];
//   },

//   async findLatestByProductId(product_id) {
//     const result = await pool.query(
//       `SELECT * FROM iot_batches 
//        WHERE product_id=$1 
//        ORDER BY created_at DESC 
//        LIMIT 1`,
//       [product_id]
//     );
//     return result.rows[0];
//   }
// };
