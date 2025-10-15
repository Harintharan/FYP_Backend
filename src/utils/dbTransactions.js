import pool from "../db.js";

export async function runInTransaction(task) {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error(
          "⚠️ Failed to rollback transaction:",
          rollbackErr
        );
      }
    }
    throw err;
  } finally {
    client?.release();
  }
}
