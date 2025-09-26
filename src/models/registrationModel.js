import { query } from "../db.js";

export async function insertRegistration({
  clientUuid,
  uuidHex,
  regType,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
}) {
  const sql = `
    INSERT INTO registrations (
      client_uuid,
      uuid_hex,
      reg_type,
      payload,
      payload_canonical,
      payload_hash,
      tx_hash,
      status,
      submitter_address
    ) VALUES (
      $1::uuid,
      $2,
      $3::reg_type,
      $4::jsonb,
      $5,
      $6,
      $7,
      'PENDING',
      $8
    )
    RETURNING id, client_uuid, status, tx_hash, payload_hash, created_at;
  `;
  const { rows } = await query(sql, [
    clientUuid,
    uuidHex,
    regType,
    payload,
    canonical,
    payloadHash,
    txHash,
    submitterAddress,
  ]);
  return rows[0];
}

export async function findByClientUuid(clientUuid) {
  const { rows } = await query(
    `SELECT * FROM registrations WHERE client_uuid = $1::uuid`,
    [clientUuid]
  );
  return rows[0] ?? null;
}

export async function updateRegistration({
  clientUuid,
  uuidHex,
  regType,
  payload,
  canonical,
  payloadHash,
  txHash,
  submitterAddress,
}) {
  const { rows } = await query(
    `UPDATE registrations
       SET uuid_hex = $2,
           reg_type = $3::reg_type,
           payload = $4::jsonb,
           payload_canonical = $5,
           payload_hash = $6,
           tx_hash = $7,
           status = 'PENDING',
           submitter_address = $8,
           approved_at = NULL,
           approved_by = NULL,
           approved_by_address = NULL,
           updated_at = now()
     WHERE client_uuid = $1::uuid
     RETURNING id, client_uuid, status, tx_hash, payload_hash, updated_at;`,
    [
      clientUuid,
      uuidHex,
      regType,
      payload,
      canonical,
      payloadHash,
      txHash,
      submitterAddress,
    ]
  );
  return rows[0] ?? null;
}

export async function findPendingRegistrationSummaries() {
  const { rows } = await query(
    `SELECT id, client_uuid, reg_type, tx_hash, payload_hash, payload_canonical, payload, created_at
     FROM registrations
     WHERE status = 'PENDING'
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function approveRegistration(clientUuid, approverAddress) {
  const { rows } = await query(
    `UPDATE registrations
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
    `UPDATE registrations
       SET status = 'REJECTED',
           approved_at = now(),
           approved_by_address = $2
     WHERE client_uuid = $1::uuid AND status = 'PENDING'
     RETURNING id, client_uuid, status, approved_at, approved_by_address`,
    [clientUuid, approverAddress]
  );
  return rows[0] ?? null;
}
