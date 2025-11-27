import pg from "pg";

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  database: "supply_chain_db",
  user: "supplychain_user",
  password: "password123",
});

await client.connect();

const result = await client.query(`
  SELECT sensor_type, value_number, sensor_timestamp 
  FROM sensor_readings 
  WHERE package_id = '30c8995e-b8e9-40ef-9908-f38222d4cd5d' 
  ORDER BY sensor_timestamp 
  LIMIT 10
`);

console.log(JSON.stringify(result.rows, null, 2));

await client.end();
