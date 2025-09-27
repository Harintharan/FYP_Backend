/**
 * Migration runner
 * This file is responsible for running all migrations in order
 */

const fs = require("fs");
const path = require("path");
const pool = require("../src/config/db");

const runMigrations = async () => {
  console.log("🔄 Starting database migrations...");

  try {
    // Get all migration files and sort them alphabetically
    const migrationsPath = path.join(__dirname);
    const migrationFiles = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith(".js") && file !== "index.js")
      .sort();

    // Check which migrations have already been run
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        run_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: completedMigrations } = await pool.query(
      "SELECT name FROM migrations"
    );
    const completedMigrationNames = completedMigrations.map((m) => m.name);

    // Run each migration if it hasn't been run already
    for (const file of migrationFiles) {
      const migrationName = file.replace(".js", "");

      if (!completedMigrationNames.includes(migrationName)) {
        console.log(`📝 Running migration: ${migrationName}`);

        const migration = require(path.join(migrationsPath, file));
        const success = await migration.migrate(pool);

        if (success) {
          console.log(`✅ Migration ${migrationName} completed successfully`);
        } else {
          console.error(`❌ Migration ${migrationName} failed`);
          break;
        }
      } else {
        console.log(
          `⏭️ Migration ${migrationName} already applied, skipping...`
        );
      }
    }

    console.log("✅ All migrations completed");
  } catch (error) {
    console.error("❌ Migration process failed:", error);
  } finally {
    // No need to end the pool as it will be used by the application
  }
};

// If this file is run directly (node migrations/index.js)
if (require.main === module) {
  runMigrations()
    .then(() => console.log("Migration process finished"))
    .catch((err) => console.error("Migration process failed with error:", err));
}

module.exports = { runMigrations };
