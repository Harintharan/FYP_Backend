BEGIN;

-- ============================================================================
-- TELEMETRY SYSTEM TABLES
-- ============================================================================
-- Creates tables for improved sensor data storage with:
-- - Telemetry messages (payload metadata)
-- - Sensor readings (individual normalized readings)
-- - Condition breaches (detected violations)
-- - Daily condition summary (analytics aggregation)
-- ============================================================================

-- 1. Telemetry Messages (metadata about each payload)
CREATE TABLE IF NOT EXISTS telemetry_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,

-- Device info
mac_address TEXT, ip_address TEXT,

-- Timing
request_send_timestamp TIMESTAMPTZ,
request_received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- Original payload preservation (for blockchain/audit)
payload_hash TEXT NOT NULL,
tx_hash TEXT NOT NULL,
pinata_cid TEXT,
pinata_pinned_at TIMESTAMPTZ,

-- Metadata
created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- Performance: count of readings in this message
reading_count INT DEFAULT 0 );

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_package ON telemetry_messages (package_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_received ON telemetry_messages (request_received_timestamp);

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_device ON telemetry_messages (mac_address, package_id);

-- 2. Sensor Readings (normalized individual readings)

CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES telemetry_messages(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
    
    sensor_type TEXT NOT NULL,
    raw_data TEXT NOT NULL,

-- Parsed fields (populated based on sensor_type)
value_number NUMERIC, value_text TEXT,

-- GPS coordinates (populated for ALL readings from nearest GPS)
latitude NUMERIC(10, 7), longitude NUMERIC(10, 7),

-- Timestamps
sensor_timestamp_unix BIGINT NOT NULL,
sensor_timestamp TIMESTAMPTZ NOT NULL,

-- Optional metadata
unit TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() );

CREATE INDEX IF NOT EXISTS idx_sensor_readings_message ON sensor_readings (message_id);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_package ON sensor_readings (package_id);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_type ON sensor_readings (sensor_type, package_id);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings (sensor_timestamp);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_lookup ON sensor_readings (
    package_id,
    sensor_type,
    sensor_timestamp
);

-- 3. Condition Breaches (detected violations)
CREATE TABLE IF NOT EXISTS condition_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
    message_id UUID REFERENCES telemetry_messages(id) ON DELETE SET NULL,
    sensor_reading_id UUID REFERENCES sensor_readings(id) ON DELETE SET NULL,

-- Breach classification
breach_type TEXT NOT NULL, severity TEXT NOT NULL,

-- Temporal data
breach_start_time TIMESTAMPTZ NOT NULL,
breach_end_time TIMESTAMPTZ,
duration_seconds INT,

-- Data quality tracking
has_data_gaps BOOLEAN DEFAULT FALSE,
total_gap_duration_seconds INT,
gap_details JSONB,
breach_certainty TEXT,

-- Measured values
measured_min_value NUMERIC,
measured_max_value NUMERIC,
measured_avg_value NUMERIC,

-- Expected thresholds (from product requirements)
expected_min_value NUMERIC, expected_max_value NUMERIC,

-- Location context
location_latitude NUMERIC(10, 7),
location_longitude NUMERIC(10, 7),
checkpoint_id UUID REFERENCES checkpoint_registry (id) ON DELETE SET NULL,

-- Shipment context
shipment_id UUID REFERENCES shipment_registry (id) ON DELETE SET NULL,
shipment_status TEXT,

-- Blockchain data
payload_hash TEXT NOT NULL,
tx_hash TEXT NOT NULL,
pinata_cid TEXT,
pinata_pinned_at TIMESTAMPTZ,

-- Details
notes TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breaches_package ON condition_breaches (package_id);

CREATE INDEX IF NOT EXISTS idx_breaches_severity ON condition_breaches (severity, breach_type);

CREATE INDEX IF NOT EXISTS idx_breaches_unresolved ON condition_breaches (package_id, resolved)
WHERE
    resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_breaches_time ON condition_breaches (breach_start_time);

CREATE INDEX IF NOT EXISTS idx_breaches_shipment ON condition_breaches (shipment_id)
WHERE
    shipment_id IS NOT NULL;

-- 4. Daily Condition Summary (analytics aggregation)
CREATE TABLE IF NOT EXISTS daily_condition_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
    sensor_type TEXT NOT NULL,
    summary_date DATE NOT NULL,

-- Reading stats
total_readings_count INT NOT NULL DEFAULT 0,
first_reading_time TIMESTAMPTZ,
last_reading_time TIMESTAMPTZ,

-- Value statistics (for numeric sensors)
min_value NUMERIC, max_value NUMERIC, avg_value NUMERIC,

-- Breach statistics
breach_count INT NOT NULL DEFAULT 0,
first_breach_time TIMESTAMPTZ,
last_breach_time TIMESTAMPTZ,
max_severity TEXT,

-- Value ranges during breaches
min_value_during_breaches NUMERIC,
max_value_during_breaches NUMERIC,

-- Status
status TEXT NOT NULL DEFAULT 'OK',
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(package_id, sensor_type, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_package ON daily_condition_summary (package_id, summary_date);

CREATE INDEX IF NOT EXISTS idx_daily_summary_status ON daily_condition_summary (status)
WHERE
    status != 'OK';

CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_condition_summary (summary_date);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_daily_summary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_summary_updated_at ON daily_condition_summary;

CREATE TRIGGER daily_summary_updated_at
BEFORE UPDATE ON daily_condition_summary
FOR EACH ROW
EXECUTE FUNCTION update_daily_summary_timestamp();

-- Record migration
INSERT INTO
    migrations (name)
VALUES ('07_create_telemetry_tables')
ON CONFLICT (name) DO NOTHING;

COMMIT;