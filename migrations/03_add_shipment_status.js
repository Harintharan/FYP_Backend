export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    // console.log("Adding shipment status column...");

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'shipment_status'
        ) THEN
          CREATE TYPE shipment_status AS ENUM (
            'PENDING',
            'ACCEPTED',
            'IN_TRANSIT',
            'DELIVERED',
            'CLOSED',
            'CANCELLED'
          );
        END IF;
      END
      $$;
    `);

    await pool.query(`
      ALTER TABLE shipment_registry
        ADD COLUMN IF NOT EXISTS status shipment_status
        DEFAULT 'PENDING';
    `);

    await pool.query(`
      UPDATE shipment_registry
         SET status = 'PENDING'
       WHERE status IS NULL;
    `);

    await pool.query(`
      ALTER TABLE shipment_registry
        ALTER COLUMN status SET NOT NULL;
    `);

    await pool.query(`
      ALTER TABLE shipment_registry
        ALTER COLUMN status SET DEFAULT 'PENDING';
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ['04_add_shipment_status']
    );

    await pool.query("COMMIT");
    // console.log("Shipment status column added.");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Failed to add shipment status column:", error);
    return false;
  }
};
