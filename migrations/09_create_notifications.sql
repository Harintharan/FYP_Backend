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

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  severity notification_severity NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  shipment_id UUID REFERENCES shipment_registry(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES shipment_segment(id) ON DELETE CASCADE,
  package_id UUID REFERENCES package_registry(id) ON DELETE CASCADE,
  breach_id UUID REFERENCES condition_breaches(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read = FALSE AND dismissed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_severity
  ON notifications(severity)
  WHERE severity IN ('ERROR', 'CRITICAL');

CREATE INDEX IF NOT EXISTS idx_notifications_shipment
  ON notifications(shipment_id)
  WHERE shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_segment
  ON notifications(segment_id)
  WHERE segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_package
  ON notifications(package_id)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_breach
  ON notifications(breach_id)
  WHERE breach_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  enabled_types JSONB DEFAULT '[]',
  disabled_types JSONB DEFAULT '[]',
  min_severity notification_severity DEFAULT 'INFO',
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;

CREATE TRIGGER notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

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
  SELECT * INTO prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  IF NOT prefs.in_app_enabled THEN
    RETURN FALSE;
  END IF;

  IF p_severity::text < prefs.min_severity::text THEN
    RETURN FALSE;
  END IF;

  IF prefs.disabled_types::jsonb ? p_type::text THEN
    RETURN FALSE;
  END IF;

  IF prefs.quiet_hours_enabled THEN
    current_time_at_tz := (NOW() AT TIME ZONE prefs.quiet_hours_timezone)::TIME;

    IF prefs.quiet_hours_start > prefs.quiet_hours_end THEN
      IF current_time_at_tz >= prefs.quiet_hours_start
        OR current_time_at_tz < prefs.quiet_hours_end THEN
        IF p_severity != 'CRITICAL' THEN
          RETURN FALSE;
        END IF;
      END IF;
    ELSE
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
