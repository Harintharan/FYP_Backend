import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function createProduct(
  {
    id,
    name,
    productCategoryId,
    manufacturerUuid,
    requiredStartTemp,
    requiredEndTemp,
    handlingInstructions,
    productHash,
    txHash,
    createdBy,
    pinataCid,
    pinataPinnedAt,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `INSERT INTO products (
       id,
       name,
       product_category_id,
       manufacturer_uuid,
       required_start_temp,
       required_end_temp,
       handling_instructions,
       product_hash,
       tx_hash,
       created_by,
       pinata_cid,
       pinata_pinned_at,
       created_at
     )
     VALUES (
       $1,
       $2,
       $3::uuid,
       $4::uuid,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       NOW()
     )`,
    [
      id,
      name,
      productCategoryId,
      manufacturerUuid,
      requiredStartTemp ?? null,
      requiredEndTemp ?? null,
      handlingInstructions ?? null,
      productHash,
      txHash,
      createdBy,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );

  return findProductById(id, dbClient);
}

export async function updateProduct(
  id,
  {
    name,
    productCategoryId,
    manufacturerUuid,
    requiredStartTemp,
    requiredEndTemp,
    handlingInstructions,
    productHash,
    txHash,
    updatedBy,
    pinataCid,
    pinataPinnedAt,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE products
        SET name = $2,
            product_category_id = $3::uuid,
            manufacturer_uuid = $4::uuid,
            required_start_temp = $5,
            required_end_temp = $6,
            handling_instructions = $7,
            product_hash = $8,
            tx_hash = $9,
            updated_by = $10,
            pinata_cid = $11,
            pinata_pinned_at = $12,
            updated_at = NOW()
      WHERE id = $1`,
    [
      id,
      name,
      productCategoryId,
      manufacturerUuid,
      requiredStartTemp ?? null,
      requiredEndTemp ?? null,
      handlingInstructions ?? null,
      productHash,
      txHash,
      updatedBy ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );

  return findProductById(id, dbClient);
}

export async function deleteProduct(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rowCount } = await exec(
    `DELETE FROM products WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}

export async function findProductById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT p.*,
            c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c
         ON c.id = p.product_category_id
      WHERE p.id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listProducts(
  { categoryId, manufacturerUuid } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const params = [];
  const conditions = [];

  if (manufacturerUuid) {
    params.push(manufacturerUuid);
    conditions.push(`p.manufacturer_uuid = $${params.length}::uuid`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`p.product_category_id = $${params.length}::uuid`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await exec(
    `SELECT p.*,
            c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c
         ON c.id = p.product_category_id
      ${whereClause}
      ORDER BY p.created_at DESC`,
    params
  );

  return rows;
}
