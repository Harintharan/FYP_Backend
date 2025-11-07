export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Creating sensor_data tables...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
        mac_address TEXT,
        ip_address TEXT,
        sensor_data JSONB NOT NULL,
        payload_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT,
        request_send_timestamp TIMESTAMPTZ,
        request_received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_data_package_id
        ON sensor_data(package_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_data_breach (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sensor_data_id UUID NOT NULL REFERENCES sensor_data(id) ON DELETE CASCADE,
        sensor_type TEXT NOT NULL,
        reading TEXT,
        note TEXT,
        detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_data_breach_sensor_data_id
        ON sensor_data_breach(sensor_data_id)
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["03_create_sensor_data"]
    );

    await pool.query("COMMIT");
    console.log("✅ sensor_data tables created");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Failed to create sensor_data tables:", error);
    return false;
  }
};
