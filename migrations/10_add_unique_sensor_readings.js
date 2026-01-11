import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running unique sensor readings migration...");

    const { rows: duplicateSummary } = await pool.query(`
      SELECT COUNT(*)::int AS duplicate_groups
      FROM (
        SELECT 1
        FROM sensor_readings
        GROUP BY package_id, sensor_type, sensor_timestamp_unix
        HAVING COUNT(*) > 1
      ) AS dup
    `);
    const duplicateGroups = duplicateSummary?.[0]?.duplicate_groups ?? 0;
    if (duplicateGroups > 0) {
      console.warn(
        `Found ${duplicateGroups} duplicate sensor reading group(s), deduplicating...`
      );
    }

    const sql = readFileSync(
      join(__dirname, "10_add_unique_sensor_readings.sql"),
      "utf8"
    );
    await pool.query(sql);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["10_add_unique_sensor_readings"]
    );

    await pool.query("COMMIT");
    console.log("Unique sensor readings migration completed.");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Unique sensor readings migration failed:", error);
    return false;
  }
};
