import { query } from "../db.js";

export async function insertRegistration({
  clientUuid,
  uuidHex,
  regType,
  publicKey,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
  pinataCid,
  pinataPinnedAt,
}) {
  const sql = `
    INSERT INTO users (
      client_uuid,
      uuid_hex,
      reg_type,
      public_key,
      payload,
      payload_canonical,
      payload_hash,
      tx_hash,
      pinata_cid,
      pinata_pinned_at,
      status,
      submitter_address
    ) VALUES (
      $1::uuid,
      $2,
      $3::reg_type,
      $4,
      $5::jsonb,
      $6,
      $7,
      $8,
      $9,
      $10,
      'PENDING',
      $11
    )
    RETURNING id, client_uuid, status, tx_hash, payload_hash, pinata_cid, pinata_pinned_at, created_at;
  `;
  const { rows } = await query(sql, [
    clientUuid,
    uuidHex,
    regType,
    publicKey,
    payload,
    canonical,
    payloadHash,
    txHash,
    pinataCid ?? null,
    pinataPinnedAt ?? null,
    submitterAddress,
  ]);
  return rows[0];
}

export async function findByClientUuid(clientUuid) {
  const { rows } = await query(
    `SELECT * FROM users WHERE client_uuid = $1::uuid`,
    [clientUuid]
  );
  return rows[0] ?? null;
}

export async function updateRegistration({
  clientUuid,
  uuidHex,
  regType,
  publicKey,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
  pinataCid,
  pinataPinnedAt,
}) {
  const { rows } = await query(
    `UPDATE users
       SET uuid_hex = $2,
           reg_type = $3::reg_type,
           public_key = $4,
           payload = $5::jsonb,
           payload_canonical = $6,
           payload_hash = $7,
           tx_hash = $8,
           pinata_cid = $9,
           pinata_pinned_at = $10,
           status = 'PENDING',
           submitter_address = $11,
           approved_at = NULL,
           approved_by = NULL,
           approved_by_address = NULL,
           updated_at = now()
     WHERE client_uuid = $1::uuid
     RETURNING id, client_uuid, status, tx_hash, payload_hash, pinata_cid, pinata_pinned_at, updated_at;`,
    [
      clientUuid,
      uuidHex,
      regType,
      publicKey,
      payload,
      canonical,
      payloadHash,
      txHash,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
      submitterAddress,
    ]
  );
  return rows[0] ?? null;
}

export async function findApprovedRegistrationByPublicKey(publicKey) {
  const { rows } = await query(
    `SELECT client_uuid, reg_type, status
       FROM users
      WHERE public_key = $1
        AND status = 'APPROVED'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [publicKey]
  );
  return rows[0] ?? null;
}

export async function findPendingRegistrationSummaries() {
  const { rows } = await query(
    `SELECT id, client_uuid, reg_type, tx_hash, payload_hash, payload_canonical, payload, created_at
     FROM users
     WHERE status = 'PENDING'
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function approveRegistration(clientUuid, approverAddress) {
  const { rows } = await query(
    `UPDATE users
       SET status = 'APPROVED',
           approved_at = now(),
           approved_by_address = $2
     WHERE client_uuid = $1::uuid AND status = 'PENDING'
     RETURNING id, client_uuid, status, approved_at, approved_by_address`,
    [clientUuid, approverAddress]
  );
  return rows[0] ?? null;
}

export async function rejectRegistration(clientUuid, approverAddress) {
  const { rows } = await query(
    `UPDATE users
       SET status = 'REJECTED',
           approved_at = now(),
           approved_by_address = $2
     WHERE client_uuid = $1::uuid AND status = 'PENDING'
     RETURNING id, client_uuid, status, approved_at, approved_by_address`,
    [clientUuid, approverAddress]
  );
  return rows[0] ?? null;
}
