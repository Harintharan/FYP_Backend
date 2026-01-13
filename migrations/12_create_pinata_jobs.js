/**
 * Migration: Create pinata_jobs queue table
 *
 * Purpose: Persist Pinata uploads for async processing without blocking API calls.
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log("?? Migration 12: Creating pinata_jobs...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pinata_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity TEXT NOT NULL,
        record_id TEXT NOT NULL,
        identifier TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload JSONB NOT NULL,
        metadata JSONB,
        pinata_options JSONB,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'SKIPPED')),
        attempts INT NOT NULL DEFAULT 0,
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pinata_jobs_status_run
        ON pinata_jobs (status, next_run_at);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pinata_jobs_entity_record
        ON pinata_jobs (entity, record_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pinata_jobs_created_at
        ON pinata_jobs (created_at);
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["12_create_pinata_jobs"]
    );

    await pool.query("COMMIT");
    console.log("? Migration 12 completed successfully!");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("? Migration 12 failed:", error.message);
    throw error;
  }
};
