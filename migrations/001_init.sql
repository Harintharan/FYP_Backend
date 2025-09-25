CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_type') THEN
    CREATE TYPE reg_type AS ENUM ('MANUFACTURER', 'SUPPLIER', 'WAREHOUSE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_status') THEN
    CREATE TYPE reg_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS accounts (
  address TEXT PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO accounts (address, role)
VALUES (LOWER('0xAdminAddressHere'), 'ADMIN')
ON CONFLICT (address) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_nonces (
  address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID UNIQUE NOT NULL,
  uuid_hex CHAR(32) UNIQUE NOT NULL,
  reg_type reg_type NOT NULL,
  payload JSONB NOT NULL,
  payload_canonical TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  status reg_status NOT NULL DEFAULT 'PENDING',
  submitter_id UUID NULL,
  submitter_address TEXT NULL,
  approved_by UUID NULL,
  approved_by_address TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_registrations_tx_hash ON registrations (tx_hash);
CREATE INDEX IF NOT EXISTS idx_registrations_payload ON registrations USING GIN (payload);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_set_updated_at ON registrations;
CREATE TRIGGER registrations_set_updated_at
BEFORE UPDATE ON registrations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
