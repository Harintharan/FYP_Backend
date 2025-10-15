export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    await pool.query(
      "ALTER TYPE reg_type ADD VALUE IF NOT EXISTS 'CONSUMER'"
    );

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["02_add_consumer_reg_type"]
    );

    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration 02_add_consumer_reg_type failed:", error);
    return false;
  }
};
