/**
 * Migration: Add LISTEN/NOTIFY trigger for pinata_jobs
 *
 * Purpose: Wake the worker immediately when new pending jobs arrive.
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log("?? Migration 13: Adding pinata_jobs notify trigger...");

    await pool.query(`
      CREATE OR REPLACE FUNCTION notify_pinata_job()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('pinata_jobs', NEW.id::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(
      "DROP TRIGGER IF EXISTS pinata_jobs_notify ON pinata_jobs"
    );

    await pool.query(`
      CREATE TRIGGER pinata_jobs_notify
      AFTER INSERT ON pinata_jobs
      FOR EACH ROW
      WHEN (NEW.status = 'PENDING')
      EXECUTE FUNCTION notify_pinata_job();
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["13_add_pinata_jobs_notify"]
    );

    await pool.query("COMMIT");
    console.log("? Migration 13 completed successfully!");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("? Migration 13 failed:", error.message);
    throw error;
  }
};
