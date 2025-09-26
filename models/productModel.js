// // models/productModel.js
// const pool = require("../config/db");

// module.exports = {
//   async createProduct({ name, manufacturer, details, db_hash, block_id }) {
//     const result = await pool.query(
//       "INSERT INTO productRegistry (name, manufacturer, details, db_hash, block_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
//       [name, manufacturer, details, db_hash, block_id]
//     );
//     return result.rows[0];
//   },

//   async updateAfterBlockchain(id, db_hash, block_id) {
//     const result = await pool.query(
//       "UPDATE productRegistry SET db_hash=$1, block_id=$2 WHERE id=$3 RETURNING *",
//       [db_hash, block_id, id]
//     );
//     return result.rows[0];
//   },

//   async getProductById(id) {
//     const result = await pool.query("SELECT * FROM productRegistry WHERE id = $1", [id]);
//     return result.rows[0];
//   },
// };
