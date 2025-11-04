import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

function toNullable(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function insertCheckpoint({
  id,
  name,
  address,
  latitude,
  longitude,
  state,
  country,
  ownerUUID,
  checkpointHash,
  txHash,
  createdBy,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO checkpoint_registry (
       id,
       name,
       address,
       latitude,
       longitude,
       state,
       country,
       owner_uuid,
       checkpoint_hash,
       tx_hash,
       created_by,
       pinata_cid,
       pinata_pinned_at,
       created_at
     )
     VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,$10,
       $11,$12,$13,
       NOW()
     )
     RETURNING *`,
    [
      id,
      name,
      toNullable(address),
      toNullable(latitude),
      toNullable(longitude),
      toNullable(state),
      toNullable(country),
      ownerUUID,
      checkpointHash,
      txHash,
      createdBy,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function updateCheckpointRecord(id, {
  name,
  address,
  latitude,
  longitude,
  state,
  country,
  ownerUUID,
  checkpointHash,
  txHash,
  updatedBy,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE checkpoint_registry
        SET name = $2,
            address = $3,
            latitude = $4,
            longitude = $5,
            state = $6,
            country = $7,
            owner_uuid = $8,
            checkpoint_hash = $9,
            tx_hash = $10,
            updated_by = $11,
            pinata_cid = $12,
            pinata_pinned_at = $13,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      name,
      toNullable(address),
      toNullable(latitude),
      toNullable(longitude),
      toNullable(state),
      toNullable(country),
      ownerUUID,
      checkpointHash,
      txHash,
      updatedBy ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findCheckpointById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM checkpoint_registry WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findCheckpointByOwnerUuid(ownerUuid, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM checkpoint_registry
      WHERE owner_uuid = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerUuid]
  );
  return rows[0] ?? null;
}

export async function listCheckpointsByOwnerUuid(ownerUuid) {
  const { rows } = await query(
    `SELECT *
       FROM checkpoint_registry
       WHERE owner_uuid = $1::uuid
       ORDER BY created_at DESC`,
    [ownerUuid]
  );
  return rows;
}

export async function listAllCheckpoints() {
  const { rows } = await query(
    `SELECT * FROM checkpoint_registry ORDER BY created_at DESC`
  );
  return rows;
}

export async function listApprovedCheckpoints() {
  const { rows } = await query(
    `SELECT cr.*
       FROM checkpoint_registry cr
       JOIN users u
         ON u.id = cr.owner_uuid
      WHERE u.status = 'APPROVED'
      ORDER BY cr.created_at DESC`
  );
  return rows;
}

export async function listApprovedCheckpointsByOwner(ownerUuid) {
  const { rows } = await query(
    `SELECT cr.*
       FROM checkpoint_registry cr
       JOIN users u
         ON u.id = cr.owner_uuid
      WHERE cr.owner_uuid = $1::uuid
        AND u.status = 'APPROVED'
      ORDER BY cr.created_at DESC`,
    [ownerUuid]
  );
  return rows;
}

export async function listApprovedCheckpointsByType(regType) {
  const { rows } = await query(
    `SELECT cr.*
       FROM checkpoint_registry cr
       JOIN users u
         ON u.id = cr.owner_uuid
      WHERE u.status = 'APPROVED'
        AND u.reg_type = $1::reg_type
      ORDER BY cr.created_at DESC`,
    [regType]
  );
  return rows;
}

export async function findApprovedCheckpointById(checkpointId) {
  const { rows } = await query(
    `SELECT cr.*
       FROM checkpoint_registry cr
       JOIN users u
         ON u.id = cr.owner_uuid
      WHERE cr.id = $1::uuid
        AND u.status = 'APPROVED'
      LIMIT 1`,
    [checkpointId]
  );
  return rows[0] ?? null;
}
