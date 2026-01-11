import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    console.log(
      "Dropping legacy sensor_data and sensor_data_breach tables if present..."
    );

    const sql = readFileSync(
      join(__dirname, "08_drop_sensor_data_tables.sql"),
      "utf8"
    );
    await pool.query(sql);

    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["08_drop_sensor_data_tables"]
    );

    await pool.query("COMMIT");
    console.log(
      "✅ sensor_data and sensor_data_breach tables dropped (if they existed)"
    );
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Failed to drop sensor_data tables:", error);
    return false;
  }
};
