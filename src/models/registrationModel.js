import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertRegistration({
  id,
  regType,
  publicKey,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const sql = `
    INSERT INTO users (
      id,
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
      $2::reg_type,
      $3,
      $4::jsonb,
      $5,
      $6,
      $7,
      $8,
      $9,
      'PENDING',
      $10
    )
    RETURNING id, status, tx_hash, payload_hash, pinata_cid, pinata_pinned_at, created_at;
  `;
  const { rows } = await exec(sql, [
    id,
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

export async function findRegistrationById(registrationId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM users WHERE id = $1::uuid`,
    [registrationId]
  );
  return rows[0] ?? null;
}

export async function findRegistrationByPublicKey(publicKey, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id, status
       FROM users
      WHERE LOWER(public_key) = LOWER($1)
      LIMIT 1`,
    [publicKey]
  );
  return rows[0] ?? null;
}

export async function updateRegistration({
  id,
  regType,
  publicKey,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE users
       SET reg_type = $2::reg_type,
           public_key = $3,
           payload = $4::jsonb,
           payload_canonical = $5,
           payload_hash = $6,
           tx_hash = $7,
           pinata_cid = $8,
           pinata_pinned_at = $9,
           status = 'PENDING',
           submitter_address = $10,
           approved_at = NULL,
           approved_by = NULL,
           approved_by_address = NULL,
           updated_at = now()
     WHERE id = $1::uuid
     RETURNING id, status, tx_hash, payload_hash, pinata_cid, pinata_pinned_at, updated_at;`,
    [
      id,
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

export async function findApprovedRegistrationByPublicKey(publicKey, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id, reg_type, status
       FROM users
      WHERE public_key = $1
        AND status = 'APPROVED'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [publicKey]
  );
  return rows[0] ?? null;
}

export async function findPendingRegistrationSummaries(dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id, reg_type, tx_hash, payload_hash, payload_canonical, payload, created_at
     FROM users
     WHERE status = 'PENDING'
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function findApprovedRegistrationSummaries(dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT id,
            reg_type,
            public_key,
            status,
            tx_hash,
            payload_hash,
            payload_canonical,
            payload,
            approved_at,
            approved_by,
            approved_by_address,
            created_at,
            updated_at
     FROM users
     WHERE status = 'APPROVED'
     ORDER BY approved_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC`
  );
  return rows;
}

export async function approveRegistration(registrationId, approverAddress, dbClient) {
  const exec = resolveExecutor(dbClient);

  const normalizedAddress =
    typeof approverAddress === "string"
      ? approverAddress.toLowerCase()
      : null;

  const { rows } = await exec(
    `UPDATE users
       SET status = 'APPROVED',
           approved_at = now(),
           approved_by = (
             SELECT id FROM accounts WHERE LOWER(address) = LOWER($2) LIMIT 1
           ),
           approved_by_address = $2
     WHERE id = $1::uuid AND status = 'PENDING'
     RETURNING id, status, approved_at, approved_by, approved_by_address`,
    [registrationId, normalizedAddress]
  );
  return rows[0] ?? null;
}

export async function rejectRegistration(registrationId, approverAddress, dbClient) {
  const exec = resolveExecutor(dbClient);
  const normalizedAddress =
    typeof approverAddress === "string"
      ? approverAddress.toLowerCase()
      : null;

  if (normalizedAddress) {
    await exec(
      `INSERT INTO accounts (address)
       VALUES ($1)
       ON CONFLICT (address) DO NOTHING`,
      [normalizedAddress]
    );
  }

  const { rows } = await exec(
    `UPDATE users
       SET status = 'REJECTED',
           approved_at = now(),
           approved_by = (
             SELECT id FROM accounts WHERE LOWER(address) = LOWER($2) LIMIT 1
           ),
           approved_by_address = $2
     WHERE id = $1::uuid AND status = 'PENDING'
     RETURNING id, status, approved_at, approved_by, approved_by_address`,
    [registrationId, normalizedAddress]
  );
  return rows[0] ?? null;
}
