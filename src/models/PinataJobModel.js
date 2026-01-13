import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function enqueuePinataJob(
  {
    entity,
    recordId,
    identifier,
    operation,
    payload,
    metadata,
    pinataOptions,
  },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const finalIdentifier = identifier ?? recordId ?? null;

  const { rows } = await exec(
    `INSERT INTO pinata_jobs (
        entity,
        record_id,
        identifier,
        operation,
        payload,
        metadata,
        pinata_options,
        status,
        attempts,
        next_run_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 0, NOW(), NOW(), NOW())
      RETURNING *`,
    [
      entity,
      recordId,
      finalIdentifier,
      operation,
      payload,
      metadata ?? null,
      pinataOptions ?? null,
    ]
  );

  return rows[0] ?? null;
}

export async function fetchPendingPinataJobs(
  { limit = 5 } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `WITH candidates AS (
        SELECT id
        FROM pinata_jobs
        WHERE status = 'PENDING'
          AND next_run_at <= NOW()
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE pinata_jobs
      SET status = 'IN_PROGRESS',
          updated_at = NOW()
      WHERE id IN (SELECT id FROM candidates)
      RETURNING *`,
    [limit]
  );

  return rows ?? [];
}

export async function markPinataJobSuccess(
  { id, attempts },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE pinata_jobs
        SET status = 'SUCCESS',
            attempts = $2,
            last_error = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attempts]
  );
}

export async function markPinataJobSkipped(
  { id, attempts, reason },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE pinata_jobs
        SET status = 'SKIPPED',
            attempts = $2,
            last_error = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attempts, reason ?? null]
  );
}

export async function schedulePinataJobRetry(
  { id, attempts, nextRunAt, errorMessage },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE pinata_jobs
        SET status = 'PENDING',
            attempts = $2,
            next_run_at = $3,
            last_error = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attempts, nextRunAt, errorMessage ?? null]
  );
}

export async function markPinataJobFailed(
  { id, attempts, errorMessage },
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `UPDATE pinata_jobs
        SET status = 'FAILED',
            attempts = $2,
            last_error = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attempts, errorMessage ?? null]
  );
}
