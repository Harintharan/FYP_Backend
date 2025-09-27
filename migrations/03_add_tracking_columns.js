/**
 * Add tracking columns migration
 * Adds tracking columns to product and batch tables
 */

const migrate = async (pool) => {
  try {
    // Start a transaction
    await pool.query("BEGIN");

    console.log("Adding tracking columns to tables...");

    // Add tracking status column to product_registry
    await pool.query(`
      ALTER TABLE product_registry
      ADD COLUMN IF NOT EXISTS tracking_active BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_tracked_at TIMESTAMP
    `);

    // Add temperature tracking columns to batches
    await pool.query(`
      ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS min_temp NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS max_temp NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS last_temp_reading NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS last_temp_reading_at TIMESTAMP
    `);

    // Record this migration as run
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["03_add_tracking_columns"]
    );

    // Commit the transaction
    await pool.query("COMMIT");
    console.log("✅ Tracking columns migration completed successfully");
    return true;
  } catch (error) {
    // Rollback on error
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};

module.exports = { migrate };
