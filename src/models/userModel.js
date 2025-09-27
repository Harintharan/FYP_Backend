// const pool = require("../config/db");

// module.exports = {
//   async createUser({ eth_address, name, id_number, company, role, details_hash, tx_hash }) {
//     const result = await pool.query(
//       `INSERT INTO users (eth_address, name, id_number, company, role, details_hash, tx_hash) 
//        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
//       [eth_address, name, id_number, company, role, details_hash, tx_hash]
//     );
//     return result.rows[0];
//   },

//  async findByAddress(address) {
//   const result = await pool.query(
//     "SELECT * FROM users WHERE eth_address=$1 LIMIT 1",
//     [address]
//   );
//   return result.rows[0];
// }

// };
