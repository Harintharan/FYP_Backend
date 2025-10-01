/**
 * Seed data migration
 * Creates initial admin user and sample checkpoints
 */

export const migrate = async (pool) => {
  try {
    // Start a transaction
    await pool.query("BEGIN");

    console.log("Running seed data migration...");

    // Add sample checkpoint data
    await pool.query(`
      INSERT INTO checkpoint_registry (
        checkpoint_id, 
        checkpoint_uuid,
        name, 
        address, 
        latitude, 
        longitude,
        owner_uuid,
        owner_type,
        checkpoint_type,
        checkpoint_hash,
        tx_hash,
        created_by
      )
      VALUES 
      (
        1001, 
        'cp-origin-001', 
        'Manufacturer Facility A',
        'Industrial Zone 1, Building 5, City A',
        '7.2906',
        '80.6337',
        'manufacturer-uuid-001',
        'Manufacturer',
        'Origin',
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        'system'
      ),
      (
        1002, 
        'cp-warehouse-001', 
        'Central Warehouse',
        'Distribution Center, Highway B, City B',
        '6.9271',
        '79.8612',
        'warehouse-uuid-001',
        'Warehouse Owner',
        'Intermediate',
        '0x2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef',
        '0xbcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890a',
        'system'
      ),
      (
        1003, 
        'cp-destination-001', 
        'Retail Distribution Center',
        'Retail Park, City C',
        '6.0535',
        '80.2210',
        'retailer-uuid-001',
        'Supplier',
        'Destination',
        '0x3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef',
        '0xcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        'system'
      )
      ON CONFLICT (checkpoint_id) DO NOTHING
    `);

    // Record this migration as run
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["02_seed_data"]
    );

    // Commit the transaction
    await pool.query("COMMIT");
    console.log("✅ Seed data migration completed successfully");
    return true;
  } catch (error) {
    // Rollback on error
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};
