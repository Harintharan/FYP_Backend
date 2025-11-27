import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running telemetry tables migration...");

    const sql = readFileSync(
      join(__dirname, "07_create_telemetry_tables.sql"),
      "utf8"
    );
    await pool.query(sql);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["07_create_telemetry_tables"]
    );

    await pool.query("COMMIT");
    console.log("✅ Telemetry tables migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};
