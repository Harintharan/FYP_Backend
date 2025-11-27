export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Creating sensor_data tables...");

    // Sensor_data and sensor_data_breach tables removed per project simplification

    // Historical migration record - replaced by new telemetry tables migration

    await pool.query("COMMIT");
    console.log("✅ sensor_data tables creation skipped/removed");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Failed to create sensor_data tables:", error);
    return false;
  }
};
