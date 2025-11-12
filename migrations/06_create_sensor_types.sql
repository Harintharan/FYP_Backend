BEGIN;

CREATE TABLE IF NOT EXISTS sensor_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    manufacturer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_types_manufacturer
  ON sensor_types (manufacturer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_types_unique_name
  ON sensor_types (manufacturer_id, LOWER(name));

INSERT INTO migrations (name)
VALUES ('06_create_sensor_types')
ON CONFLICT (name) DO NOTHING;

COMMIT;
