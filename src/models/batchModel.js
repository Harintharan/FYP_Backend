const pool = require("../config/db");

module.exports = {
    async createBatch(data) {
        const result = await pool.query(
            `INSERT INTO batches
     (batch_id, product_category, manufacturer_uuid, facility, production_window, quantity_produced, release_status,
      batch_hash, tx_hash, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     RETURNING *`,
            [
                data.batch_id,            // ← blockchain batchId
                data.product_category,
                data.manufacturer_uuid,
                data.facility,
                data.production_window,
                data.quantity_produced,
                data.release_status,
                data.batch_hash,
                data.tx_hash,
                data.created_by,
            ]
        );
        return result.rows[0];
    }
    ,

    async updateBatch(id, data) {
        const result = await pool.query(
            `UPDATE batches SET
        product_category=$1, manufacturer_uuid=$2, facility=$3,
        production_window=$4, quantity_produced=$5, release_status=$6,
        batch_hash=$7, tx_hash=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
            [
                data.product_category,
                data.manufacturer_uuid,
                data.facility,
                data.production_window,
                data.quantity_produced,
                data.release_status,
                data.batch_hash,
                data.tx_hash,
                data.updated_by,
                id,
            ]
        );
        return result.rows[0];
    },

    async getBatchById(id) {
        const result = await pool.query(`SELECT * FROM batches WHERE id=$1`, [id]);
        return result.rows[0];
    },
};
