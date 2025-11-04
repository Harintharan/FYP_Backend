import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function createProductCategory({ id, name }, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO product_categories (
       id,
       name,
       created_at
     )
     VALUES ($1, $2, NOW())
     RETURNING *`,
    [id, name]
  );
  return rows[0] ?? null;
}

export async function updateProductCategory(id, { name }, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE product_categories
        SET name = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, name]
  );
  return rows[0] ?? null;
}

export async function deleteProductCategory(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rowCount } = await exec(
    `DELETE FROM product_categories WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}

export async function findProductCategoryById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM product_categories
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findProductCategoryByName(name, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM product_categories
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1`,
    [name]
  );
  return rows[0] ?? null;
}

export async function listProductCategories(dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM product_categories
      ORDER BY created_at DESC, name ASC`
  );
  return rows;
}
