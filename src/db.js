import { Pool } from "pg";
import { dbUrl } from "./config.js";

const pool = new Pool({
  connectionString: dbUrl,
  ssl:
    process.env.NODE_ENV === "production" || process.env.DATABASE_URL
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("error", (err) => {
  console.error("Unexpected database error", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export { pool };
export default pool;
