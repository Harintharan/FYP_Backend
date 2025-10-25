-- Initial schema for the supply-chain backend.
-- Mirrors migrations/01_initial_schema.js so the database can be
-- recreated with raw SQL when desired.

BEGIN;

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    run_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_type') THEN
    CREATE TYPE reg_type AS ENUM ('MANUFACTURER', 'SUPPLIER', 'WAREHOUSE', 'CONSUMER');

END IF;

END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reg_status') THEN
    CREATE TYPE reg_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
    CREATE TYPE product_status AS ENUM (
      'PRODUCT_CREATED',
      'PRODUCT_READY_FOR_SHIPMENT',
      'PRODUCT_ALLOCATED',
      'PRODUCT_IN_TRANSIT',
      'PRODUCT_DELIVERED',
      'PRODUCT_RETURNED',
      'PRODUCT_CANCELLED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipment_segment_status') THEN
    CREATE TYPE shipment_segment_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'IN_TRANSIT',
      'DELIVERED',
      'CLOSED',
      'CANCELLED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    address TEXT NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO
    accounts (address, role)
VALUES (
        LOWER('0xAdminAddressHere'),
        'ADMIN'
    )
ON CONFLICT (address) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    reg_type reg_type NOT NULL,
    public_key TEXT,
    payload JSONB NOT NULL,
    payload_canonical TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    status reg_status NOT NULL DEFAULT 'PENDING',
    submitter_address TEXT,
    approved_by UUID REFERENCES accounts (id),
    approved_by_address TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS pinata_cid TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS pinata_pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_registrations_status ON users (status);

CREATE INDEX IF NOT EXISTS idx_registrations_tx_hash ON users (tx_hash);

CREATE INDEX IF NOT EXISTS idx_registrations_payload ON users USING GIN (payload);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_set_updated_at ON users;

CREATE TRIGGER registrations_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_category TEXT NOT NULL,
    manufacturer_uuid TEXT NOT NULL,
    facility TEXT NOT NULL,
    production_window TEXT NOT NULL,
    quantity_produced TEXT NOT NULL,
    release_status TEXT NOT NULL,
    expiry_date TEXT,
    handling_instructions TEXT,
    required_start_temp TEXT,
    required_end_temp TEXT,
    batch_hash TEXT,
    tx_hash TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS checkpoint_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    address TEXT,
    latitude TEXT,
    longitude TEXT,
    state TEXT,
    country TEXT,
    owner_uuid UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    checkpoint_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipment_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    manufacturer_uuid TEXT NOT NULL,
    consumer_uuid TEXT NOT NULL,
    shipment_hash TEXT,
    tx_hash TEXT,
    created_by TEXT,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_registry_owner_uuid ON checkpoint_registry (owner_uuid);

CREATE TABLE IF NOT EXISTS product_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_name TEXT NOT NULL,
    product_category TEXT NOT NULL,
    batch_id UUID REFERENCES batches (id) ON DELETE SET NULL,
    shipment_id UUID REFERENCES shipment_registry (id) ON DELETE SET NULL,
    quantity INT,
    microprocessor_mac TEXT,
    sensor_types TEXT,
    wifi_ssid TEXT,
    wifi_password TEXT,
    manufacturer_uuid TEXT,
    product_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP,
    status product_status
);

CREATE TABLE IF NOT EXISTS shipment_segment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    shipment_id UUID NOT NULL REFERENCES shipment_registry (id) ON DELETE CASCADE,
    start_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry (id),
    end_checkpoint_id UUID NOT NULL REFERENCES checkpoint_registry (id),
    expected_ship_date TEXT NOT NULL,
    estimated_arrival_date TEXT NOT NULL,
    time_tolerance TEXT,
    supplier_id UUID REFERENCES users (id) ON DELETE SET NULL,
    segment_order INT NOT NULL,
    status shipment_segment_status NOT NULL DEFAULT 'PENDING',
    segment_hash TEXT NOT NULL,
    tx_hash TEXT,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_segment_shipment
  ON shipment_segment (shipment_id);

INSERT INTO
    migrations (name)
VALUES ('01_initial_schema')
ON CONFLICT (name) DO NOTHING;

COMMIT;
