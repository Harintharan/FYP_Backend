import { Pool } from "pg";
import { dbUrl } from "./config.js";

const pool = new Pool({
  connectionString: dbUrl,
});

pool.on("error", (err) => {
  console.error("Unexpected database error", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export default pool;
