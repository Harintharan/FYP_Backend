import { query } from "../db.js";

export async function upsertNonce(address, nonce, expiresAt) {
  await query(
    `INSERT INTO auth_nonces (address, nonce, issued_at, expires_at)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (address)
     DO UPDATE SET nonce = EXCLUDED.nonce, issued_at = now(), expires_at = EXCLUDED.expires_at`,
    [address, nonce, expiresAt]
  );
}

export async function getNonce(address) {
  const { rows } = await query(
    `SELECT nonce, expires_at FROM auth_nonces WHERE address = $1`,
    [address]
  );
  return rows[0] ?? null;
}

export async function deleteNonce(address) {
  await query(`DELETE FROM auth_nonces WHERE address = $1`, [address]);
}

export async function getAccountRole(address) {
  const { rows } = await query(
    `SELECT role FROM accounts WHERE address = $1`,
    [address]
  );
  return rows[0]?.role ?? null;
}
