export const migrate = async (pool) => {
  await pool.query("BEGIN");
  console.log(
    "Running migration 04_extend_checkpoint_and_shipment_location..."
  );

  try {
    await pool.query(`
      ALTER TABLE shipment_registry
        ADD COLUMN IF NOT EXISTS state TEXT,
        ADD COLUMN IF NOT EXISTS country TEXT
    `);

    await pool.query(`
      ALTER TABLE checkpoint_registry
        ADD COLUMN IF NOT EXISTS state TEXT,
        ADD COLUMN IF NOT EXISTS country TEXT
    `);

    await pool.query("COMMIT");
    console.log(
      "Migration 04_extend_checkpoint_and_shipment_location completed successfully"
    );
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(
      "Migration 04_extend_checkpoint_and_shipment_location failed:",
      error
    );
    throw error;
  }
};
