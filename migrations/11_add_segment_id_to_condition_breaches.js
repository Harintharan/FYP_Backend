/**
 * Migration: Add segment_id to condition_breaches table
 *
 * Purpose: Link condition breaches directly to shipment segments
 * Benefits:
 * - Simplifies supplier alert queries (direct lookup instead of JOIN)
 * - Works correctly even after segment status changes
 * - Provides audit trail of which segment had the breach
 * - Captures segment context at time of breach
 *
 * Important: segment_id should ONLY be populated when segment status is IN_TRANSIT
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log("🔄 Migration 11: Adding segment_id to condition_breaches...");

    // Step 1: Add the segment_id column (only if table exists)
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'condition_breaches'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'condition_breaches' AND column_name = 'segment_id'
          ) THEN
            ALTER TABLE condition_breaches
            ADD COLUMN segment_id UUID REFERENCES shipment_segment (id);
            RAISE NOTICE 'Added segment_id column';
          ELSE
            RAISE NOTICE 'segment_id column already exists';
          END IF;
        ELSE
          RAISE NOTICE 'condition_breaches table does not exist yet, skipping migration';
        END IF;
      END $$;
    `);
    console.log("✅ Column addition checked");

    // Step 2: Create index for better query performance on segment lookups (safe if table exists)
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'condition_breaches'
        ) THEN
          CREATE INDEX IF NOT EXISTS idx_breaches_segment ON condition_breaches (segment_id);
          RAISE NOTICE 'Created index idx_breaches_segment';
        END IF;
      END $$;
    `);
    console.log("✅ Index creation checked");

    // Step 3: Create filtered index for supplier alert queries
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'condition_breaches'
        ) THEN
          CREATE INDEX IF NOT EXISTS idx_breaches_segment_supplier 
          ON condition_breaches (segment_id)
          WHERE segment_id IS NOT NULL;
          RAISE NOTICE 'Created index idx_breaches_segment_supplier';
        END IF;
      END $$;
    `);
    console.log("✅ Filtered index creation checked");

    // Step 4: Add comment documenting the business logic
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'condition_breaches'
        ) THEN
          COMMENT ON COLUMN condition_breaches.segment_id IS 
          'Direct reference to shipment_segment. Only populated when segment status is IN_TRANSIT at time of breach. NULL for other statuses.';
          RAISE NOTICE 'Added column comment';
        END IF;
      END $$;
    `);
    console.log("✅ Comment added");

    // Record migration
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["11_add_segment_id_to_condition_breaches"]
    );

    await pool.query("COMMIT");
    console.log("✅ Migration 11 completed successfully!");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration 11 failed:", error.message);
    throw error;
  }
};
