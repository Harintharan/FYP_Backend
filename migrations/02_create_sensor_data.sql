BEGIN;

CREATE TABLE IF NOT EXISTS sensor_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    package_id UUID NOT NULL REFERENCES package_registry (id) ON DELETE CASCADE,
    mac_address TEXT,
    ip_address TEXT,
    sensor_data JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT,
    request_send_timestamp TIMESTAMPTZ,
    request_received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sensor_data_package_id
  ON sensor_data (package_id);

CREATE TABLE IF NOT EXISTS sensor_data_breach (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    sensor_data_id UUID NOT NULL REFERENCES sensor_data (id) ON DELETE CASCADE,
    sensor_type TEXT NOT NULL,
    reading TEXT,
    note TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sensor_data_breach_sensor_data_id
  ON sensor_data_breach (sensor_data_id);

INSERT INTO migrations (name)
VALUES ('03_create_sensor_data')
ON CONFLICT (name) DO NOTHING;

COMMIT;

