import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

const BASE_SELECT = `
  SELECT
    id,
    manufacturer_id,
    name,
    created_at,
    updated_at
  FROM sensor_types
`;

export async function createSensorType(
  { id, manufacturerId, name },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO sensor_types (
       id,
       manufacturer_id,
       name,
       created_at
     )
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [id, manufacturerId, name]
  );
  return rows[0] ?? null;
}

export async function updateSensorType(
  { id, manufacturerId, name },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE sensor_types
        SET name = $3,
            updated_at = NOW()
      WHERE id = $1
        AND manufacturer_id = $2
      RETURNING *`,
    [id, manufacturerId, name]
  );
  return rows[0] ?? null;
}

export async function deleteSensorType({ id, manufacturerId }, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rowCount } = await exec(
    `DELETE FROM sensor_types
      WHERE id = $1
        AND manufacturer_id = $2`,
    [id, manufacturerId]
  );
  return rowCount > 0;
}

export async function findSensorTypeById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `${BASE_SELECT}
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findSensorTypeByName(
  { manufacturerId, name },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `${BASE_SELECT}
      WHERE manufacturer_id = $1
        AND LOWER(name) = LOWER($2)
      LIMIT 1`,
    [manufacturerId, name]
  );
  return rows[0] ?? null;
}

export async function listSensorTypesByManufacturer(
  manufacturerId,
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `${BASE_SELECT}
      WHERE manufacturer_id = $1
      ORDER BY created_at DESC, name ASC`,
    [manufacturerId]
  );
  return rows;
}
