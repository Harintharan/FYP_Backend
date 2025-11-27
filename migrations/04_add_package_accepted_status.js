export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    // console.log("Adding PACKAGE_ACCEPTED status to package_status enum...");

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_enum
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
           WHERE pg_type.typname = 'package_status'
             AND enumlabel = 'PACKAGE_ACCEPTED'
        ) THEN
          ALTER TYPE package_status ADD VALUE 'PACKAGE_ACCEPTED';
        END IF;
      END
      $$;
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["05_add_package_accepted_status"]
    );

    await pool.query("COMMIT");
    // console.log("PACKAGE_ACCEPTED status added successfully.");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Failed to add PACKAGE_ACCEPTED status:", error);
    return false;
  }
};
