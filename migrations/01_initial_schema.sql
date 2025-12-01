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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_status') THEN
    CREATE TYPE package_status AS ENUM (
      'PACKAGE_READY_FOR_SHIPMENT',
      'PACKAGE_ALLOCATED',
      'PACKAGE_ACCEPTED',
      'PACKAGE_IN_TRANSIT',
      'PACKAGE_DELIVERED',
      'PACKAGE_RETURNED',
      'PACKAGE_CANCELLED'
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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipment_status') THEN
    CREATE TYPE shipment_status AS ENUM (
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

-- Add refresh_tokens table for authentication
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

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_address ON refresh_tokens (address);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens (expires_at, revoked);

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
    product_id UUID NOT NULL REFERENCES products (id),
    manufacturer_uuid UUID NOT NULL REFERENCES users (id),
    facility TEXT NOT NULL,
    production_start_time TIMESTAMP,
    production_end_time TIMESTAMP,
    quantity_produced TEXT NOT NULL,
    expiry_date TEXT,
    batch_hash TEXT,
    tx_hash TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON batches (product_id);

CREATE INDEX IF NOT EXISTS idx_batches_manufacturer ON batches (manufacturer_uuid);

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
    status shipment_status NOT NULL DEFAULT 'PENDING',
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

CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    product_category_id UUID NOT NULL REFERENCES product_categories (id),
    manufacturer_uuid UUID NOT NULL REFERENCES users (id),
    required_start_temp TEXT,
    required_end_temp TEXT,
    handling_instructions TEXT,
    product_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (product_category_id);

CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products (manufacturer_uuid);

CREATE TABLE IF NOT EXISTS package_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    batch_id UUID REFERENCES batches (id) ON DELETE SET NULL,
    shipment_id UUID REFERENCES shipment_registry (id) ON DELETE SET NULL,
    quantity INT,
    microprocessor_mac TEXT,
    sensor_types TEXT,
    manufacturer_uuid TEXT,
    product_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT,
    updated_at TIMESTAMP,
    status package_status
);

ALTER TABLE package_registry
DROP COLUMN IF EXISTS product_name,
DROP COLUMN IF EXISTS product_category,
DROP COLUMN IF EXISTS wifi_ssid,
DROP COLUMN IF EXISTS wifi_password;

CREATE TABLE IF NOT EXISTS sensor_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    manufacturer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_types_manufacturer ON sensor_types (manufacturer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_types_unique_name ON sensor_types (manufacturer_id, LOWER(name));

-- sensor_data and sensor_data_breach tables removed. Previously used to store raw sensor payloads and breach details.
-- Removed to centralize telemetry under telemetry_messages and sensor_readings tables.

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

CREATE INDEX IF NOT EXISTS idx_shipment_segment_shipment ON shipment_segment (shipment_id);

-- ============================================================================
-- TELEMETRY SYSTEM TABLES
-- ============================================================================

-- 1. Telemetry Messages (metadata about each payload)
CREATE TABLE IF NOT EXISTS telemetry_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    package_id UUID NOT NULL REFERENCES package_registry (id) ON DELETE CASCADE,
    mac_address TEXT,
    ip_address TEXT,
    request_send_timestamp TIMESTAMPTZ,
    request_received_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reading_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_package ON telemetry_messages (package_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_received ON telemetry_messages (request_received_timestamp);

CREATE INDEX IF NOT EXISTS idx_telemetry_messages_device ON telemetry_messages (mac_address, package_id);

-- 2. Sensor Readings (normalized individual readings)
CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    message_id UUID NOT NULL REFERENCES telemetry_messages (id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES package_registry (id) ON DELETE CASCADE,
    sensor_type TEXT NOT NULL,
    raw_data TEXT NOT NULL,
    value_number NUMERIC,
    value_text TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    sensor_timestamp_unix BIGINT NOT NULL,
    sensor_timestamp TIMESTAMPTZ NOT NULL,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    package_id UUID NOT NULL REFERENCES package_registry (id) ON DELETE CASCADE,
    message_id UUID REFERENCES telemetry_messages (id) ON DELETE SET NULL,
    sensor_reading_id UUID REFERENCES sensor_readings (id) ON DELETE SET NULL,
    breach_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    breach_start_time TIMESTAMPTZ NOT NULL,
    breach_end_time TIMESTAMPTZ,
    duration_seconds INT,
    has_data_gaps BOOLEAN DEFAULT FALSE,
    total_gap_duration_seconds INT,
    gap_details JSONB,
    breach_certainty TEXT,
    measured_min_value NUMERIC,
    measured_max_value NUMERIC,
    measured_avg_value NUMERIC,
    expected_min_value NUMERIC,
    expected_max_value NUMERIC,
    location_latitude NUMERIC(10, 7),
    location_longitude NUMERIC(10, 7),
    checkpoint_id UUID REFERENCES checkpoint_registry (id) ON DELETE SET NULL,
    shipment_id UUID REFERENCES shipment_registry (id) ON DELETE SET NULL,
    shipment_status TEXT,
    payload_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    package_id UUID NOT NULL REFERENCES package_registry (id) ON DELETE CASCADE,
    sensor_type TEXT NOT NULL,
    summary_date DATE NOT NULL,
    total_readings_count INT NOT NULL DEFAULT 0,
    first_reading_time TIMESTAMPTZ,
    last_reading_time TIMESTAMPTZ,
    min_value NUMERIC,
    max_value NUMERIC,
    avg_value NUMERIC,
    breach_count INT NOT NULL DEFAULT 0,
    first_breach_time TIMESTAMPTZ,
    last_breach_time TIMESTAMPTZ,
    max_severity TEXT,
    min_value_during_breaches NUMERIC,
    max_value_during_breaches NUMERIC,
    status TEXT NOT NULL DEFAULT 'OK',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (
        package_id,
        sensor_type,
        summary_date
    )
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

-- ============================================================================
-- NOTIFICATION SYSTEM
-- ============================================================================

-- Create notification_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'SHIPMENT_CREATED',
      'SHIPMENT_ACCEPTED',
      'SHIPMENT_IN_TRANSIT',
      'SHIPMENT_DELIVERED',
      'SHIPMENT_CANCELLED',
      'SEGMENT_CREATED',
      'SEGMENT_ASSIGNED',
      'SEGMENT_ACCEPTED',
      'SEGMENT_TAKEOVER',
      'SEGMENT_HANDOVER',
      'SEGMENT_DELIVERED',
      'PACKAGE_CREATED',
      'PACKAGE_ACCEPTED',
      'PACKAGE_DELIVERED',
      'CONDITION_BREACH',
      'TEMPERATURE_BREACH',
      'TIME_BREACH',
      'SYSTEM_ALERT',
      'USER_MENTION'
    );
  END IF;
END
$$;

-- Create notification_severity enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_severity') THEN
    CREATE TYPE notification_severity AS ENUM (
      'INFO',
      'SUCCESS',
      'WARNING',
      'ERROR',
      'CRITICAL'
    );
  END IF;
END
$$;

-- Create notifications table

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  severity notification_severity NOT NULL DEFAULT 'INFO',
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,

-- Related entities (for navigation and context)
shipment_id UUID REFERENCES shipment_registry (id) ON DELETE CASCADE,
segment_id UUID REFERENCES shipment_segment (id) ON DELETE CASCADE,
package_id UUID REFERENCES package_registry (id) ON DELETE CASCADE,
breach_id UUID REFERENCES condition_breaches (id) ON DELETE CASCADE,

-- Additional context data
metadata JSONB DEFAULT '{}',

-- Action tracking
read BOOLEAN DEFAULT FALSE,
read_at TIMESTAMPTZ,
dismissed BOOLEAN DEFAULT FALSE,
dismissed_at TIMESTAMPTZ,

-- Audit fields
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC)
WHERE
    read = FALSE
    AND dismissed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications (severity)
WHERE
    severity IN ('ERROR', 'CRITICAL');

CREATE INDEX IF NOT EXISTS idx_notifications_shipment ON notifications (shipment_id)
WHERE
    shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_segment ON notifications (segment_id)
WHERE
    segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_package ON notifications (package_id)
WHERE
    package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_breach ON notifications (breach_id)
WHERE
    breach_id IS NOT NULL;

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

-- Channel preferences
in_app_enabled BOOLEAN DEFAULT TRUE,
email_enabled BOOLEAN DEFAULT FALSE,
push_enabled BOOLEAN DEFAULT FALSE,

-- Type preferences (JSONB for flexibility)
enabled_types JSONB DEFAULT '[]',
disabled_types JSONB DEFAULT '[]',

-- Severity filters
min_severity notification_severity DEFAULT 'INFO',

-- Quiet hours
quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT DEFAULT 'UTC',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create trigger for notification_preferences updated_at
DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;

CREATE TRIGGER notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Create function to clean up old notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND read = TRUE;
  
  DELETE FROM notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to get unread count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM notifications
  WHERE user_id = p_user_id
    AND read = FALSE
    AND dismissed = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());
  
  RETURN unread_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if notifications should be sent (respects quiet hours)
CREATE OR REPLACE FUNCTION should_send_notification(
  p_user_id UUID,
  p_type notification_type,
  p_severity notification_severity
)
RETURNS BOOLEAN AS $$
DECLARE
  prefs RECORD;
  current_time_at_tz TIME;
BEGIN
  -- Get user preferences
  SELECT * INTO prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences exist, allow notification
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;
  
  -- Check if in-app notifications are disabled
  IF NOT prefs.in_app_enabled THEN
    RETURN FALSE;
  END IF;
  
  -- Check severity filter
  IF p_severity::text < prefs.min_severity::text THEN
    RETURN FALSE;
  END IF;
  
  -- Check if type is explicitly disabled
  IF prefs.disabled_types::jsonb ? p_type::text THEN
    RETURN FALSE;
  END IF;
  
  -- Check quiet hours
  IF prefs.quiet_hours_enabled THEN
    current_time_at_tz := (NOW() AT TIME ZONE prefs.quiet_hours_timezone)::TIME;
    
    -- Handle overnight quiet hours (e.g., 22:00 to 06:00)
    IF prefs.quiet_hours_start > prefs.quiet_hours_end THEN
      IF current_time_at_tz >= prefs.quiet_hours_start 
        OR current_time_at_tz < prefs.quiet_hours_end THEN
        -- During quiet hours, only allow CRITICAL notifications
        IF p_severity != 'CRITICAL' THEN
          RETURN FALSE;
        END IF;
      END IF;
    ELSE
      -- Normal quiet hours (e.g., 13:00 to 14:00)
      IF current_time_at_tz >= prefs.quiet_hours_start 
        AND current_time_at_tz < prefs.quiet_hours_end THEN
        IF p_severity != 'CRITICAL' THEN
          RETURN FALSE;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

INSERT INTO
    migrations (name)
VALUES ('01_initial_schema')
ON CONFLICT (name) DO NOTHING;

COMMIT;