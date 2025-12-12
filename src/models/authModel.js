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

export async function getAccountRole(address, approvedRegistration) {
  if (typeof address !== "string") {
    return "USER";
  }

  const normalizedAddress = address.toLowerCase();

  const adminResult = await query(
    `SELECT role FROM accounts WHERE LOWER(address) = $1 LIMIT 1`,
    [normalizedAddress]
  );

  if (adminResult.rows[0]?.role === "ADMIN") {
    return "ADMIN";
  }

  const registration =
    approvedRegistration ?? (await getApprovedUserByAddress(normalizedAddress));
  const regType = registration?.reg_type;

  if (
    regType === "MANUFACTURER" ||
    regType === "SUPPLIER" ||
    regType === "WAREHOUSE" ||
    regType === "CONSUMER"
  ) {
    return regType;
  }

  return "USER";
}

export async function getApprovedUserByAddress(address) {
  if (typeof address !== "string") {
    return null;
  }

  const normalizedAddress = address.toLowerCase();

  const { rows } = await query(
    `SELECT id, reg_type
       FROM users
      WHERE status = 'APPROVED'
        AND public_key IS NOT NULL
        AND LOWER(public_key) = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [normalizedAddress]
  );

  return rows[0] ?? null;
}

// Refresh Token Management

export async function createRefreshToken(
  address,
  token,
  expiresAt,
  userAgent = null,
  ipAddress = null
) {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (address, token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, token, expires_at`,
    [address, token, expiresAt, userAgent, ipAddress]
  );
  return rows[0];
}

export async function findRefreshToken(token) {
  const { rows } = await query(
    `SELECT id, address, token, expires_at, revoked, last_used_at
     FROM refresh_tokens
     WHERE token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function updateRefreshTokenLastUsed(tokenId) {
  await query(
    `UPDATE refresh_tokens
     SET last_used_at = NOW()
     WHERE id = $1`,
    [tokenId]
  );
}

export async function revokeRefreshToken(token) {
  await query(
    `UPDATE refresh_tokens
     SET revoked = TRUE, revoked_at = NOW()
     WHERE token = $1`,
    [token]
  );
}

export async function revokeAllRefreshTokensForAddress(address) {
  await query(
    `UPDATE refresh_tokens
     SET revoked = TRUE, revoked_at = NOW()
     WHERE address = $1 AND revoked = FALSE`,
    [address]
  );
}

export async function deleteExpiredRefreshTokens() {
  const { rowCount } = await query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW() OR revoked = TRUE`,
    []
  );
  return rowCount;
}
