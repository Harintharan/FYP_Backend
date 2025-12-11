import { Pool } from "pg";
import { dbUrl } from "./config.js";

// Determine SSL configuration based on DB_SSL environment variable
// Set DB_SSL=true in production (Heroku sets this automatically)
// Set DB_SSL=false or leave unset for local development
const sslConfig =
  process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: sslConfig,
});

pool.on("error", (err) => {
  console.error("Unexpected database error", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export { pool };
export default pool;
