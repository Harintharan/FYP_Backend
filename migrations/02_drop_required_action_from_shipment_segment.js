export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'shipment_segment'
             AND column_name = 'required_action'
        ) THEN
          ALTER TABLE shipment_segment
            DROP COLUMN required_action;
        END IF;
      END
      $$;
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["02_drop_required_action_from_shipment_segment"]
    );

    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(
      "❌ Migration 02_drop_required_action_from_shipment_segment failed:",
      error
    );
    return false;
  }
};
