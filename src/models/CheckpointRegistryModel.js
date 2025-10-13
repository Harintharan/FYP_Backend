import { query } from "../db.js";

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
  ownerType,
  checkpointType,
  checkpointHash,
  txHash,
  createdBy,
  pinataCid,
  pinataPinnedAt,
}) {
  const { rows } = await query(
    `INSERT INTO checkpoint_registry (
       id,
       name,
       address,
       latitude,
       longitude,
       state,
       country,
       owner_uuid,
       owner_type,
       checkpoint_type,
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
       $11,$12,$13,$14,$15,
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
      ownerType,
      checkpointType,
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
  ownerType,
  checkpointType,
  checkpointHash,
  txHash,
  updatedBy,
  pinataCid,
  pinataPinnedAt,
}) {
  const { rows } = await query(
    `UPDATE checkpoint_registry
        SET name = $2,
            address = $3,
            latitude = $4,
            longitude = $5,
            state = $6,
            country = $7,
            owner_uuid = $8,
            owner_type = $9,
            checkpoint_type = $10,
            checkpoint_hash = $11,
            tx_hash = $12,
            updated_by = $13,
            pinata_cid = $14,
            pinata_pinned_at = $15,
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
      ownerType,
      checkpointType,
      checkpointHash,
      txHash,
      updatedBy ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function findCheckpointById(id) {
  const { rows } = await query(
    `SELECT * FROM checkpoint_registry WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listCheckpointsByOwnerUuid(ownerUuid) {
  const { rows } = await query(
    `SELECT *
       FROM checkpoint_registry
      WHERE LOWER(owner_uuid) = LOWER($1)
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
