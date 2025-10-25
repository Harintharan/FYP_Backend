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
             AND column_name = 'from_user_id'
        ) THEN
          ALTER TABLE shipment_segment
            DROP COLUMN from_user_id;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'shipment_segment'
             AND column_name = 'to_user_id'
        ) THEN
          ALTER TABLE shipment_segment
            DROP COLUMN to_user_id;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'shipment_segment'
             AND column_name = 'supplier_id'
        ) THEN
          ALTER TABLE shipment_segment
            ADD COLUMN supplier_id UUID REFERENCES users (id) ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'shipment_segment'
             AND column_name = 'segment_order'
        ) THEN
          ALTER TABLE shipment_segment
            ADD COLUMN segment_order INT;

          UPDATE shipment_segment
             SET segment_order = sub.ordinal
            FROM (
              SELECT id, ROW_NUMBER() OVER (
                PARTITION BY shipment_id
                ORDER BY created_at ASC, id
              ) AS ordinal
                FROM shipment_segment
            ) AS sub
           WHERE shipment_segment.id = sub.id;

          ALTER TABLE shipment_segment
            ALTER COLUMN segment_order SET NOT NULL;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      INSERT INTO migrations (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING
    `, ["03_replace_shipment_segment_user_columns"]);

    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(
      "❌ Migration 03_replace_shipment_segment_user_columns failed:",
      error
    );
    return false;
  }
};
