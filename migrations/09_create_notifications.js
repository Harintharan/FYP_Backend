/**
 * Notification System Migration
 * Creates tables and triggers for real-time notifications
 */

export const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");
    console.log("Running notifications migration...");

    // Create notification_type enum
    await pool.query(`
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
    `);

    // Create notification_severity enum
    await pool.query(`
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
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type notification_type NOT NULL,
        severity notification_severity NOT NULL DEFAULT 'INFO',
        
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        
        -- Related entities (for navigation and context)
        shipment_id UUID REFERENCES shipment_registry(id) ON DELETE CASCADE,
        segment_id UUID REFERENCES shipment_segment(id) ON DELETE CASCADE,
        package_id UUID REFERENCES package_registry(id) ON DELETE CASCADE,
        breach_id UUID REFERENCES condition_breaches(id) ON DELETE CASCADE,
        
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
      )
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
        ON notifications(user_id, created_at DESC) 
        WHERE read = FALSE AND dismissed = FALSE
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_all 
        ON notifications(user_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_type 
        ON notifications(type, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_severity 
        ON notifications(severity) 
        WHERE severity IN ('ERROR', 'CRITICAL')
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_shipment 
        ON notifications(shipment_id) 
        WHERE shipment_id IS NOT NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_segment 
        ON notifications(segment_id) 
        WHERE segment_id IS NOT NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_package 
        ON notifications(package_id) 
        WHERE package_id IS NOT NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_breach 
        ON notifications(breach_id) 
        WHERE breach_id IS NOT NULL
    `);

    // Create notification_preferences table
    await pool.query(`
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
      )
    `);

    // Create trigger for notification_preferences updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences
    `);

    await pool.query(`
      CREATE TRIGGER notification_preferences_updated_at
      BEFORE UPDATE ON notification_preferences
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `);

    // Create function to clean up old notifications
    await pool.query(`
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
    `);

    // Create function to get unread count
    await pool.query(`
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
    `);

    // Create function to check if notifications should be sent (respects quiet hours)
    await pool.query(`
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
    `);

    await pool.query("COMMIT");
    console.log("✅ Notifications migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Notifications migration failed:", error);
    throw error;
  }
};
