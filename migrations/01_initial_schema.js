/**
 * Initial database schema migration
 * Creates all the required tables for the supply chain application
 */

const migrate = async (pool) => {
  try {
    // Start a transaction
    await pool.query("BEGIN");

    console.log("Running initial schema migration...");

    // Create a migrations table to track which migrations have been run
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        run_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create batches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        batch_id INT UNIQUE NOT NULL, -- blockchain batchId
        product_category TEXT NOT NULL,
        manufacturer_uuid TEXT NOT NULL,
        facility TEXT NOT NULL,
        production_window TEXT NOT NULL,
        quantity_produced TEXT NOT NULL,
        release_status TEXT NOT NULL,
        batch_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      )
    `);

    // Create product_registry table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_registry (
        id SERIAL PRIMARY KEY,
        product_id INT UNIQUE NOT NULL,       -- blockchain productId
        product_uuid TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_category TEXT NOT NULL,
        batch_lot_id INT REFERENCES batches(batch_id) ON DELETE SET NULL,
        required_storage_temp TEXT,
        transport_route_plan_id TEXT,
        handling_instructions TEXT,
        expiry_date TEXT NOT NULL,           
        sensor_device_uuid TEXT,
        microprocessor_mac TEXT,
        sensor_types TEXT,
        qr_id TEXT,
        wifi_ssid TEXT,
        wifi_password TEXT,
        manufacturer_uuid TEXT,
        origin_facility_addr TEXT,
        product_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP,
        status TEXT NOT NULL
      )
    `);

    // Create checkpoint_registry table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkpoint_registry (
        id SERIAL PRIMARY KEY,
        checkpoint_id INT UNIQUE NOT NULL,        -- Blockchain checkpointId
        checkpoint_uuid TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        latitude TEXT,
        longitude TEXT,
        owner_uuid TEXT NOT NULL,
        owner_type TEXT NOT NULL,                 -- Manufacturer / Supplier / Warehouse Owner
        checkpoint_type TEXT NOT NULL,            -- Origin / Intermediate / Destination
        checkpoint_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP  
      )
    `);

    // Create shipment_registry table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_registry (
        id SERIAL PRIMARY KEY,
        shipment_id INT UNIQUE NOT NULL, -- blockchain id
        manufacturer_uuid TEXT NOT NULL,
        destination_party_uuid TEXT NOT NULL,
        shipment_items JSONB,       -- array of { product_uuid, quantity }
        shipment_hash TEXT,
        tx_hash TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by TEXT,
        updated_at TIMESTAMP
      )
    `);

    // Create shipment_handover_checkpoints table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_handover_checkpoints (
        id SERIAL PRIMARY KEY,
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        start_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        end_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        estimated_arrival_date TEXT NOT NULL,
        time_tolerance TEXT NOT NULL,
        expected_ship_date TEXT NOT NULL,
        required_action TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create shipment_segment_acceptance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_segment_acceptance (
        id SERIAL PRIMARY KEY,
        acceptance_id INT NOT NULL UNIQUE,
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        segment_start_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        segment_end_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        assigned_role VARCHAR(100) NOT NULL,
        assigned_party_uuid VARCHAR(100) NOT NULL,
        estimated_pickup_time TEXT NOT NULL,   -- store raw ISO string
        estimated_delivery_time TEXT NOT NULL, -- store raw ISO string
        shipment_items JSONB NOT NULL,
        acceptance_timestamp TEXT NOT NULL,    -- store raw ISO string
        digital_signature TEXT,
        acceptance_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by VARCHAR(100),
        updated_at TIMESTAMP
      )
    `);

    // Create shipment_segment_handover table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shipment_segment_handover (
        id SERIAL PRIMARY KEY,
        handover_id INT NOT NULL UNIQUE,         -- blockchain ID
        shipment_id INT NOT NULL REFERENCES shipment_registry(shipment_id) ON DELETE CASCADE,
        acceptance_id INT NOT NULL REFERENCES shipment_segment_acceptance(acceptance_id) ON DELETE CASCADE,
        segment_start_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        segment_end_checkpoint_id INT NOT NULL REFERENCES checkpoint_registry(checkpoint_id),
        from_party_uuid VARCHAR(100) NOT NULL,
        to_party_uuid VARCHAR(100) NOT NULL,
        handover_timestamp TEXT NOT NULL,        -- stored as string
        gps_lat NUMERIC(10,6),
        gps_lon NUMERIC(10,6),
        quantity_transferred INT NOT NULL,
        from_party_signature TEXT NOT NULL,
        to_party_signature TEXT NOT NULL,
        handover_hash TEXT NOT NULL,             -- integrity hash
        tx_hash TEXT NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_by VARCHAR(100),
        updated_at TIMESTAMP
      )
    `);

    // Record this migration as run
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["01_initial_schema"]
    );

    // Commit the transaction
    await pool.query("COMMIT");
    console.log("✅ Initial schema migration completed successfully");
    return true;
  } catch (error) {
    // Rollback on error
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};

module.exports = { migrate };
