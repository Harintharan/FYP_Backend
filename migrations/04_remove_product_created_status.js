export const migrate = async (pool) => {
  const client = pool;
  await client.query("BEGIN");

  try {
    const {
      rows: [defaultRow],
    } = await client.query(
      `
        SELECT pg_get_expr(d.adbin, d.adrelid) AS default_expr
          FROM pg_attribute a
          JOIN pg_class c ON a.attrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         WHERE c.relname = 'product_registry'
           AND n.nspname = current_schema()
           AND a.attname = 'status'
           AND a.attnum > 0
           AND NOT a.attisdropped
      `
    );

    const existingDefault = defaultRow?.default_expr ?? null;

    const { rows } = await client.query(
      `
        SELECT enumlabel
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'product_status'
      `
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      return true;
    }

    const hasDeprecatedValue = rows.some(
      (row) => row.enumlabel === "PRODUCT_CREATED"
    );

    if (!hasDeprecatedValue) {
      if (existingDefault) {
        await client.query("COMMIT");
        return true;
      }
      await client.query("COMMIT");
      return true;
    }

    if (existingDefault) {
      await client.query(`
        ALTER TABLE product_registry
        ALTER COLUMN status DROP DEFAULT
      `);
    }

    await client.query(`
      UPDATE product_registry
         SET status = 'PRODUCT_READY_FOR_SHIPMENT'::product_status
       WHERE status = 'PRODUCT_CREATED'::product_status
    `);

    await client.query(`ALTER TYPE product_status RENAME TO product_status_old`);

    await client.query(`
      CREATE TYPE product_status AS ENUM (
        'PRODUCT_READY_FOR_SHIPMENT',
        'PRODUCT_ALLOCATED',
        'PRODUCT_IN_TRANSIT',
        'PRODUCT_DELIVERED',
        'PRODUCT_RETURNED',
        'PRODUCT_CANCELLED'
      )
    `);

    await client.query(`
      ALTER TABLE product_registry
      ALTER COLUMN status TYPE product_status
      USING status::text::product_status
    `);

    if (existingDefault) {
      const updatedDefault = existingDefault
        .replace(/product_status_old/g, "product_status")
        .replace(/'PRODUCT_CREATED'/g, "'PRODUCT_READY_FOR_SHIPMENT'");

      await client.query(`
        ALTER TABLE product_registry
        ALTER COLUMN status SET DEFAULT ${updatedDefault}
      `);
    }

    await client.query(`DROP TYPE product_status_old`);

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};
