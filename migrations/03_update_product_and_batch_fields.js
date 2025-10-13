const PRODUCT_STATUS_VALUES = [
  "CREATED",
  "READY TO SHIPMENT",
  "SHIPMENT ACCEPTED",
  "SHIPMENT HANDOVERED",
  "SHIPMENT DELIVERED",
];

export const migrate = async (pool) => {
  await pool.query("BEGIN");
  console.log("Running migration 03_update_product_and_batch_fields...");

  try {
    await pool.query(`
      ALTER TABLE product_registry
        DROP COLUMN IF EXISTS transport_route_plan_id,
        DROP COLUMN IF EXISTS handling_instructions,
        DROP COLUMN IF EXISTS expiry_date,
        DROP COLUMN IF EXISTS origin_facility_addr,
        DROP COLUMN IF EXISTS required_storage_temp,
        DROP COLUMN IF EXISTS sensor_device_uuid,
        DROP COLUMN IF EXISTS qr_id
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
          CREATE TYPE product_status AS ENUM (
            'CREATED',
            'READY TO SHIPMENT',
            'SHIPMENT ACCEPTED',
            'SHIPMENT HANDOVERED',
            'SHIPMENT DELIVERED'
          );
        END IF;
      END
      $$;
    `);

    await pool.query(
      `
        UPDATE product_registry
           SET status = NULL
         WHERE status IS NOT NULL
           AND status NOT IN (${PRODUCT_STATUS_VALUES.map((_, idx) => `$${idx + 1}`).join(", ")})
      `,
      PRODUCT_STATUS_VALUES
    );

    await pool.query(`
      ALTER TABLE product_registry
        ALTER COLUMN status TYPE product_status USING
          CASE
            WHEN status IS NULL THEN NULL
            ELSE status::product_status
          END,
        ALTER COLUMN status DROP DEFAULT
    `);

    await pool.query(`
      ALTER TABLE batches
        ADD COLUMN IF NOT EXISTS expiry_date TEXT,
        ADD COLUMN IF NOT EXISTS handling_instructions TEXT,
        ADD COLUMN IF NOT EXISTS required_start_temp TEXT,
        ADD COLUMN IF NOT EXISTS required_end_temp TEXT
    `);

    await pool.query("COMMIT");
    console.log(
      "Migration 03_update_product_and_batch_fields completed successfully"
    );
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(
      "Migration 03_update_product_and_batch_fields failed:",
      error
    );
    throw error;
  }
};
