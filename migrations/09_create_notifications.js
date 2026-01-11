import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running notifications migration...");

    const sql = readFileSync(
      join(__dirname, "09_create_notifications.sql"),
      "utf8"
    );
    await pool.query(sql);

    await pool.query("COMMIT");
    console.log("✅ Notifications migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Notifications migration failed:", error);
    throw error;
  }
};
