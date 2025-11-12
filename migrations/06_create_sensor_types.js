export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Creating sensor_types table...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        manufacturer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_types_manufacturer
        ON sensor_types(manufacturer_id)
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_types_unique_name
        ON sensor_types (manufacturer_id, LOWER(name))
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["06_create_sensor_types"]
    );

    await pool.query("COMMIT");
    console.log("? sensor_types table created");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("? Failed to create sensor_types table:", error);
    return false;
  }
};
