import { query } from "./src/db.js";

const res = await query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
);
console.log("Tables:", res.rows.map((r) => r.tablename).join(", "));

const pkgRes = await query(
  "SELECT id, batch_id FROM package_registry WHERE batch_id IS NOT NULL LIMIT 5"
);
console.log("\nPackages with batch_id:", pkgRes.rows);

process.exit(0);
