-- Migration to add refresh tokens table
-- This allows users to get new access tokens without re-authenticating

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    address TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    user_agent TEXT,
    ip_address TEXT
);

-- Index for looking up tokens by address
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_address ON refresh_tokens (address);

-- Index for looking up tokens by token value
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token);

-- Index for finding expired or revoked tokens for cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens (expires_at, revoked);

INSERT INTO
    migrations (name)
VALUES ('06_add_refresh_tokens')
ON CONFLICT (name) DO NOTHING;

COMMIT;