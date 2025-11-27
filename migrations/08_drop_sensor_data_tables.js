export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log(
      "Dropping legacy sensor_data and sensor_data_breach tables if present..."
    );

    // Drop indexes (if present) and tables in correct order
    await pool.query(`
      DROP INDEX IF EXISTS idx_sensor_data_breach_sensor_data_id;
    `);
    await pool.query(`
      DROP TABLE IF EXISTS sensor_data_breach CASCADE;
    `);
    await pool.query(`
      DROP INDEX IF EXISTS idx_sensor_data_package_id;
    `);
    await pool.query(`
      DROP TABLE IF EXISTS sensor_data CASCADE;
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["08_drop_sensor_data_tables"]
    );

    await pool.query("COMMIT");
    console.log(
      "✅ sensor_data and sensor_data_breach tables dropped (if they existed)"
    );
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Failed to drop sensor_data tables:", error);
    return false;
  }
};
