BEGIN;

CREATE TABLE IF NOT EXISTS pinata_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    identifier TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB,
    pinata_options JSONB,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'SKIPPED')),
    attempts INT NOT NULL DEFAULT 0,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pinata_jobs_status_run
    ON pinata_jobs (status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_pinata_jobs_entity_record
    ON pinata_jobs (entity, record_id);

CREATE INDEX IF NOT EXISTS idx_pinata_jobs_created_at
    ON pinata_jobs (created_at);

INSERT INTO
    migrations (name)
VALUES ('12_create_pinata_jobs')
ON CONFLICT (name) DO NOTHING;

COMMIT;
