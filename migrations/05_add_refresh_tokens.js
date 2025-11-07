/**
 * Refresh tokens migration.
 * Adds support for refresh token authentication.
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running migration: 06_add_refresh_tokens");

    // Create refresh_tokens table
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

    // Create index for looking up tokens by address
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_address 
        ON refresh_tokens (address)
    `);

    // Create index for looking up tokens by token value
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token 
        ON refresh_tokens (token)
    `);

    // Create index for finding expired or revoked tokens for cleanup
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup 
        ON refresh_tokens (expires_at, revoked)
    `);

    // Record migration
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["06_add_refresh_tokens"]
    );

    await pool.query("COMMIT");
    console.log("✅ Refresh tokens migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Refresh tokens migration failed:", error);
    return false;
  }
};
