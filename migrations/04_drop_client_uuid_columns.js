export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log("?? Aligning registrations table with id-only identifiers...");

    await pool.query(`
      UPDATE users
         SET id = client_uuid
       WHERE client_uuid IS NOT NULL
         AND id <> client_uuid
    `);

    await pool.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS uuid_hex,
        DROP COLUMN IF EXISTS client_uuid
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["04_drop_client_uuid_columns"]
    );

    await pool.query("COMMIT");
    console.log("? client_uuid and uuid_hex columns removed");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("? Failed to drop legacy client_uuid columns:", error);
    return false;
  }
};
