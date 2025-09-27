import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pool from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log("🔄 Starting database migrations...");

  try {
    const migrationFiles = fs
      .readdirSync(__dirname)
      .filter((file) => file.endsWith(".js") && file !== "index.js")
      .sort();

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
    const completedMigrationNames = new Set(
      completedMigrations.map((migration) => migration.name)
    );

    for (const file of migrationFiles) {
      const migrationName = file.replace(".js", "");

      if (!completedMigrationNames.has(migrationName)) {
        console.log(`📝 Running migration: ${migrationName}`);
        const moduleUrl = pathToFileURL(path.join(__dirname, file)).href;
        const migrationModule = await import(moduleUrl);
        const migrate = migrationModule.migrate;

        if (typeof migrate !== "function") {
          throw new Error(
            `Migration ${migrationName} does not export a migrate function`
          );
        }

        const success = await migrate(pool);
        if (success) {
          console.log(`✅ Migration ${migrationName} completed`);
        } else {
          throw new Error(`Migration ${migrationName} failed`);
        }
      } else {
        console.log(`⏭️ Migration ${migrationName} already applied, skipping`);
      }
    }

    console.log("🎉 All migrations complete");
  } catch (error) {
    console.error("❌ Failed to run migrations:", error);
    throw error;
  }
}
