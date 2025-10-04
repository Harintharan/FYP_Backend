export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    const tables = [
      "accounts",
      "users",
      "batches",
      "product_registry",
      "checkpoint_registry",
      "shipment_registry",
      "shipment_handover_checkpoints",
      "shipment_segment_acceptance",
      "shipment_segment_handover",
    ];

    for (const table of tables) {
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pinata_cid TEXT`
      );
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pinata_pinned_at TIMESTAMPTZ`
      );
    }

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["03_add_pinata_columns"]
    );

    await pool.query("COMMIT");
    console.log("✅ Added Pinata metadata columns");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Failed to add Pinata columns:", error);
    return false;
  }
};
