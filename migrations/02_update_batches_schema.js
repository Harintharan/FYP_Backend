export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    await pool.query(`
      ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS product_id UUID
    `);

    await pool.query(`
      ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS production_start_time TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS production_end_time TIMESTAMP
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'batches'
             AND column_name = 'manufacturer_uuid'
             AND data_type = 'uuid'
        ) THEN
          UPDATE batches
             SET manufacturer_uuid = NULL
           WHERE manufacturer_uuid IS NOT NULL
             AND manufacturer_uuid::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

          ALTER TABLE batches
            ALTER COLUMN manufacturer_uuid TYPE UUID
            USING NULLIF(manufacturer_uuid, '')::uuid;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.table_constraints
           WHERE constraint_name = 'fk_batches_manufacturer'
             AND table_name = 'batches'
             AND constraint_type = 'FOREIGN KEY'
             AND constraint_schema = current_schema()
        ) THEN
          ALTER TABLE batches
            ADD CONSTRAINT fk_batches_manufacturer
            FOREIGN KEY (manufacturer_uuid)
            REFERENCES users(id);
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.table_constraints
           WHERE constraint_name = 'fk_batches_product'
             AND table_name = 'batches'
             AND constraint_type = 'FOREIGN KEY'
             AND constraint_schema = current_schema()
        ) THEN
          ALTER TABLE batches
            ADD CONSTRAINT fk_batches_product
            FOREIGN KEY (product_id)
            REFERENCES products(id);
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_batches_product
        ON batches(product_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_batches_manufacturer
        ON batches(manufacturer_uuid)
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS product_category
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS production_window
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS handling_instructions
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS required_start_temp
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS required_end_temp
    `);

    await pool.query(`
      ALTER TABLE batches
        DROP COLUMN IF EXISTS release_status
    `);

    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};
