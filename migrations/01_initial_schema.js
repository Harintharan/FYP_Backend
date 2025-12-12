/**
 * Initial database schema migration.
 * Recreates every required enum, function, trigger, and table
 * for a clean deployment of the supply-chain backend.
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running initial schema migration...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        run_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_type') THEN
          CREATE TYPE reg_type AS ENUM ('MANUFACTURER', 'SUPPLIER', 'WAREHOUSE', 'CONSUMER');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_status') THEN
          CREATE TYPE reg_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_status') THEN
          CREATE TYPE package_status AS ENUM (
            'PACKAGE_READY_FOR_SHIPMENT',
            'PACKAGE_ALLOCATED',
            'PACKAGE_ACCEPTED',
            'PACKAGE_IN_TRANSIT',
            'PACKAGE_DELIVERED',
            'PACKAGE_RETURNED',
            'PACKAGE_CANCELLED'
          );
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'shipment_segment_status'
        ) THEN
          CREATE TYPE shipment_segment_status AS ENUM (
            'PENDING',
            'ACCEPTED',
            'IN_TRANSIT',
            'DELIVERED',
            'CLOSED',
            'CANCELLED'
          );
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'shipment_status'
        ) THEN
          CREATE TYPE shipment_status AS ENUM (
            'PENDING',
            'ACCEPTED',
            'IN_TRANSIT',
            'DELIVERED',
            'CLOSED',
            'CANCELLED'
          );
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        address TEXT NOT NULL UNIQUE,
        role user_role NOT NULL DEFAULT 'USER',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      `INSERT INTO accounts (address, role)
       VALUES (LOWER('0xAdminAddressHere'), 'ADMIN')
       ON CONFLICT (address) DO NOTHING`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_nonces (
        address TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        issued_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reg_type reg_type NOT NULL,
        public_key TEXT,
        payload JSONB NOT NULL,
        payload_canonical TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        status reg_status NOT NULL DEFAULT 'PENDING',
        submitter_address TEXT,
        approved_by UUID REFERENCES accounts(id),
        approved_by_address TEXT,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_registrations_status ON users (status)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_registrations_tx_hash ON users (tx_hash)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_registrations_payload ON users USING GIN (payload)`
    );

    // Add refresh_tokens table for authentication
    await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          address TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_used_at TIMESTAMPTZ,
          revoked BOOLEAN DEFAULT FALSE,
          revoked_at TIMESTAMPTZ,
          user_agent TEXT,
          ip_address TEXT
        )
      `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_address ON refresh_tokens (address)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens (expires_at, revoked)`
    );

    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(
      `DROP TRIGGER IF EXISTS registrations_set_updated_at ON users`
    );
    await pool.query(`
      CREATE TRIGGER registrations_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkpoint_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        address TEXT,
        latitude TEXT,
        longitude TEXT,
        state TEXT,
        country TEXT,
        owner_uuid UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        checkpoint_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoint_registry_owner_uuid
        ON checkpoint_registry(owner_uuid);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        manufacturer_uuid TEXT NOT NULL,
        consumer_uuid TEXT NOT NULL,
        status shipment_status NOT NULL DEFAULT 'PENDING',
        shipment_hash TEXT,
        tx_hash TEXT,
        created_by TEXT,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoint_registry_owner_uuid
        ON checkpoint_registry(owner_uuid)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        product_category_id UUID NOT NULL REFERENCES product_categories(id),
        manufacturer_uuid UUID NOT NULL REFERENCES users(id),
        required_start_temp TEXT,
        required_end_temp TEXT,
        handling_instructions TEXT,
        product_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_by TEXT,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_products_category
        ON products(product_category_id);
      CREATE INDEX IF NOT EXISTS idx_products_manufacturer
        ON products(manufacturer_uuid)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id),
        manufacturer_uuid UUID NOT NULL REFERENCES users(id),
        facility TEXT NOT NULL,
        production_start_time TIMESTAMP,
        production_end_time TIMESTAMP,
        quantity_produced TEXT NOT NULL,
        expiry_date TEXT,
        batch_hash TEXT,
        tx_hash TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_batches_product
        ON batches(product_id);
      CREATE INDEX IF NOT EXISTS idx_batches_manufacturer
        ON batches(manufacturer_uuid)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS package_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
        shipment_id UUID REFERENCES shipment_registry(id) ON DELETE SET NULL,
        quantity INT,
        microprocessor_mac TEXT,
        sensor_types TEXT,
        manufacturer_uuid TEXT,
        product_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP,
        status package_status
      )
    `);

    await pool.query(`
      ALTER TABLE package_registry
        DROP COLUMN IF EXISTS product_name,
        DROP COLUMN IF EXISTS product_category,
        DROP COLUMN IF EXISTS wifi_ssid,
        DROP COLUMN IF EXISTS wifi_password
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        manufacturer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_types_manufacturer
        ON sensor_types(manufacturer_id)
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_types_unique_name
        ON sensor_types (manufacturer_id, LOWER(name))
    `);

    // sensor_data table creation removed - legacy table
    // sensor_data_breach table creation removed - legacy table that referenced sensor_data

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_segment (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id UUID NOT NULL REFERENCES shipment_registry(id) ON DELETE CASCADE,
        start_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        end_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        expected_ship_date TEXT NOT NULL,
        estimated_arrival_date TEXT NOT NULL,
        time_tolerance TEXT,
        supplier_id UUID REFERENCES users(id) ON DELETE SET NULL,
        segment_order INT NOT NULL,
        status shipment_segment_status NOT NULL DEFAULT 'PENDING',
        segment_hash TEXT NOT NULL,
        tx_hash TEXT,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shipment_segment_shipment
        ON shipment_segment (shipment_id);
    `);

    // ============================================================================
    // TELEMETRY SYSTEM TABLES
    // ============================================================================

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
        mac_address TEXT,
        ip_address TEXT,
        request_send_timestamp TIMESTAMPTZ,
        request_received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reading_count INT DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_messages_package ON telemetry_messages(package_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_messages_received ON telemetry_messages(request_received_timestamp)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_messages_device ON telemetry_messages(mac_address, package_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES telemetry_messages(id) ON DELETE CASCADE,
        package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
        sensor_type TEXT NOT NULL,
        raw_data TEXT NOT NULL,
        value_number NUMERIC,
        value_text TEXT,
        latitude NUMERIC(10, 7),
        longitude NUMERIC(10, 7),
        sensor_timestamp_unix BIGINT NOT NULL,
        sensor_timestamp TIMESTAMPTZ NOT NULL,
        unit TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_message ON sensor_readings(message_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_package ON sensor_readings(package_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_type ON sensor_readings(sensor_type, package_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(sensor_timestamp)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_lookup ON sensor_readings(package_id, sensor_type, sensor_timestamp)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS condition_breaches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
        message_id UUID REFERENCES telemetry_messages(id) ON DELETE SET NULL,
        sensor_reading_id UUID REFERENCES sensor_readings(id) ON DELETE SET NULL,
        breach_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        breach_start_time TIMESTAMPTZ NOT NULL,
        breach_end_time TIMESTAMPTZ,
        duration_seconds INT,
        has_data_gaps BOOLEAN DEFAULT FALSE,
        total_gap_duration_seconds INT,
        gap_details JSONB,
        breach_certainty TEXT,
        measured_min_value NUMERIC,
        measured_max_value NUMERIC,
        measured_avg_value NUMERIC,
        expected_min_value NUMERIC,
        expected_max_value NUMERIC,
        location_latitude NUMERIC(10, 7),
        location_longitude NUMERIC(10, 7),
        checkpoint_id UUID REFERENCES checkpoint_registry(id) ON DELETE SET NULL,
        shipment_id UUID REFERENCES shipment_registry(id) ON DELETE SET NULL,
        shipment_status TEXT,
        payload_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        notes TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_breaches_package ON condition_breaches(package_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_breaches_severity ON condition_breaches(severity, breach_type)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_breaches_unresolved ON condition_breaches(package_id, resolved) WHERE resolved = FALSE
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_breaches_time ON condition_breaches(breach_start_time)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_breaches_shipment ON condition_breaches(shipment_id) WHERE shipment_id IS NOT NULL
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_condition_summary (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
        sensor_type TEXT NOT NULL,
        summary_date DATE NOT NULL,
        total_readings_count INT NOT NULL DEFAULT 0,
        first_reading_time TIMESTAMPTZ,
        last_reading_time TIMESTAMPTZ,
        min_value NUMERIC,
        max_value NUMERIC,
        avg_value NUMERIC,
        breach_count INT NOT NULL DEFAULT 0,
        first_breach_time TIMESTAMPTZ,
        last_breach_time TIMESTAMPTZ,
        max_severity TEXT,
        min_value_during_breaches NUMERIC,
        max_value_during_breaches NUMERIC,
        status TEXT NOT NULL DEFAULT 'OK',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(package_id, sensor_type, summary_date)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_package ON daily_condition_summary(package_id, summary_date)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_status ON daily_condition_summary(status) WHERE status != 'OK'
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_condition_summary(summary_date)
    `);

    await pool.query(`
      CREATE OR REPLACE FUNCTION update_daily_summary_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS daily_summary_updated_at ON daily_condition_summary
    `);

    await pool.query(`
      CREATE TRIGGER daily_summary_updated_at
      BEFORE UPDATE ON daily_condition_summary
      FOR EACH ROW
      EXECUTE FUNCTION update_daily_summary_timestamp()
    `);

    // sensor_data_breach table creation removed - legacy table

    await pool.query("COMMIT");
    console.log("✅ Initial schema migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};
