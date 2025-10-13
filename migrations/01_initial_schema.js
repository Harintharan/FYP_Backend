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
          CREATE TYPE reg_type AS ENUM ('MANUFACTURER', 'SUPPLIER', 'WAREHOUSE');
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
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_category TEXT NOT NULL,
        manufacturer_uuid TEXT NOT NULL,
        facility TEXT NOT NULL,
        production_window TEXT NOT NULL,
        quantity_produced TEXT NOT NULL,
        release_status TEXT NOT NULL,
        expiry_date TEXT,
        handling_instructions TEXT,
        required_start_temp TEXT,
        required_end_temp TEXT,
        batch_hash TEXT,
        tx_hash TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name TEXT NOT NULL,
        product_category TEXT NOT NULL,
        batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
        microprocessor_mac TEXT,
        sensor_types TEXT,
        wifi_ssid TEXT,
        wifi_password TEXT,
        manufacturer_uuid TEXT,
        product_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP,
        status product_status
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkpoint_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        address TEXT,
        latitude TEXT,
        longitude TEXT,
        owner_uuid TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        checkpoint_type TEXT NOT NULL,
        checkpoint_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        pinata_cid TEXT,
        pinata_pinned_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_registry (
        id SERIAL PRIMARY KEY,
        shipment_id INT UNIQUE NOT NULL,
        manufacturer_uuid TEXT NOT NULL,
        destination_party_uuid TEXT NOT NULL,
        shipment_items JSONB,
        shipment_hash TEXT,
        tx_hash TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_handover_checkpoints (
        id SERIAL PRIMARY KEY,
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        start_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        end_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        estimated_arrival_date TEXT NOT NULL,
        time_tolerance TEXT NOT NULL,
        expected_ship_date TEXT NOT NULL,
        required_action TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_segment_acceptance (
        id SERIAL PRIMARY KEY,
        acceptance_id INT NOT NULL UNIQUE,
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        segment_start_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        segment_end_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        assigned_role VARCHAR(100) NOT NULL,
        assigned_party_uuid VARCHAR(100) NOT NULL,
        estimated_pickup_time TEXT NOT NULL,
        estimated_delivery_time TEXT NOT NULL,
        shipment_items JSONB NOT NULL,
        acceptance_timestamp TEXT NOT NULL,
        digital_signature TEXT,
        acceptance_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by VARCHAR(100),
        updated_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_segment_handover (
        id SERIAL PRIMARY KEY,
        handover_id INT NOT NULL UNIQUE,
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        acceptance_id INT NOT NULL REFERENCES shipment_segment_acceptance(acceptance_id) ON DELETE CASCADE,
        segment_start_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        segment_end_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry(id),
        from_party_uuid VARCHAR(100) NOT NULL,
        to_party_uuid VARCHAR(100) NOT NULL,
        handover_timestamp TEXT NOT NULL,
        gps_lat NUMERIC(10, 6),
        gps_lon NUMERIC(10, 6),
        quantity_transferred INT NOT NULL,
        from_party_signature TEXT NOT NULL,
        to_party_signature TEXT NOT NULL,
        handover_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by VARCHAR(100),
        updated_at TIMESTAMP
      )
    `);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["01_initial_schema"]
    );

    await pool.query("COMMIT");
    console.log("✅ Initial schema migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};
