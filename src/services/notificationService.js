import { query } from "../db.js";
import {
  emitNotificationToUser,
  broadcastNotification,
} from "../websocket/notificationHandler.js";

/**
 * Notification Service
 * Handles creation, retrieval, and management of notifications
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const NotificationType = {
  SHIPMENT_CREATED: "SHIPMENT_CREATED",
  SHIPMENT_ACCEPTED: "SHIPMENT_ACCEPTED",
  SHIPMENT_IN_TRANSIT: "SHIPMENT_IN_TRANSIT",
  SHIPMENT_DELIVERED: "SHIPMENT_DELIVERED",
  SHIPMENT_CANCELLED: "SHIPMENT_CANCELLED",
  SEGMENT_CREATED: "SEGMENT_CREATED",
  SEGMENT_ASSIGNED: "SEGMENT_ASSIGNED",
  SEGMENT_ACCEPTED: "SEGMENT_ACCEPTED",
  SEGMENT_TAKEOVER: "SEGMENT_TAKEOVER",
  SEGMENT_HANDOVER: "SEGMENT_HANDOVER",
  SEGMENT_DELIVERED: "SEGMENT_DELIVERED",
  PACKAGE_CREATED: "PACKAGE_CREATED",
  PACKAGE_ACCEPTED: "PACKAGE_ACCEPTED",
  PACKAGE_DELIVERED: "PACKAGE_DELIVERED",
  CONDITION_BREACH: "CONDITION_BREACH",
  TEMPERATURE_BREACH: "TEMPERATURE_BREACH",
  TIME_BREACH: "TIME_BREACH",
  SYSTEM_ALERT: "SYSTEM_ALERT",
  USER_MENTION: "USER_MENTION",
};

export const NotificationSeverity = {
  INFO: "INFO",
  SUCCESS: "SUCCESS",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
};

// ============================================================================
// CREATE NOTIFICATION
// ============================================================================

/**
 * Creates a notification for a user
 * @param {Object} params - Notification parameters
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  severity = NotificationSeverity.INFO,
  shipmentId = null,
  segmentId = null,
  packageId = null,
  breachId = null,
  metadata = {},
  expiresInDays = null,
}) {
  try {
    // Check if notification should be sent based on user preferences
    const shouldSend = await query(
      `SELECT should_send_notification($1, $2, $3) as should_send`,
      [userId, type, severity]
    );

    if (!shouldSend.rows[0]?.should_send) {
      console.log(`⏭️ Notification skipped for user ${userId} (preferences)`);
      return null;
    }

    const expiresAt = expiresInDays
      ? `NOW() + INTERVAL '${expiresInDays} days'`
      : null;

    const result = await query(
      `INSERT INTO notifications (
        user_id, type, severity, title, message,
        shipment_id, segment_id, package_id, breach_id,
        metadata, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${expiresAt || "NULL"})
      RETURNING *`,
      [
        userId,
        type,
        severity,
        title,
        message,
        shipmentId,
        segmentId,
        packageId,
        breachId,
        JSON.stringify(metadata),
      ]
    );

    const notification = formatNotification(result.rows[0]);

    // Emit real-time notification via WebSocket
    emitNotificationToUser(userId, {
      type: "NEW_NOTIFICATION",
      data: notification,
    });

    console.log(`✅ Notification created for user ${userId}: ${type}`);

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Creates notifications for multiple users
 * @param {Array<string>} userIds - Array of user IDs
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Array>} Created notifications
 */
export async function createBulkNotifications(userIds, notificationData) {
  const notifications = await Promise.all(
    userIds.map((userId) =>
      createNotification({
        userId,
        ...notificationData,
      })
    )
  );

  return notifications.filter((n) => n !== null);
}

// ============================================================================
// RETRIEVE NOTIFICATIONS
// ============================================================================

/**
 * Gets notifications for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Notifications with pagination
 */
export async function getUserNotifications(
  userId,
  {
    unreadOnly = false,
    limit = 50,
    offset = 0,
    type = null,
    severity = null,
    includeExpired = false,
  } = {}
) {
  try {
    const conditions = ["user_id = $1"];
    const params = [userId];
    let paramCount = 1;

    if (unreadOnly) {
      conditions.push("read = FALSE");
    }

    if (type) {
      paramCount++;
      conditions.push(`type = $${paramCount}`);
      params.push(type);
    }

    if (severity) {
      paramCount++;
      conditions.push(`severity = $${paramCount}`);
      params.push(severity);
    }

    if (!includeExpired) {
      conditions.push("(expires_at IS NULL OR expires_at > NOW())");
    }

    conditions.push("dismissed = FALSE");

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM notifications WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get notifications
    const result = await query(
      `SELECT * FROM notifications 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    );

    return {
      notifications: result.rows.map(formatNotification),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    console.error("Error getting user notifications:", error);
    throw error;
  }
}

/**
 * Gets unread notification count for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Unread count
 */
export async function getUnreadCount(userId) {
  try {
    const result = await query(
      `SELECT get_unread_notification_count($1) as count`,
      [userId]
    );
    return parseInt(result.rows[0].count) || 0;
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}

// ============================================================================
// UPDATE NOTIFICATIONS
// ============================================================================

/**
 * Marks notifications as read
 * @param {Array<string>} notificationIds - Notification IDs
 * @param {string} userId - User ID (for security)
 * @returns {Promise<number>} Number of notifications updated
 */
export async function markAsRead(notificationIds, userId) {
  try {
    const result = await query(
      `UPDATE notifications 
       SET read = TRUE, read_at = NOW()
       WHERE id = ANY($1) AND user_id = $2 AND read = FALSE
       RETURNING id`,
      [notificationIds, userId]
    );

    const updatedCount = result.rows.length;

    if (updatedCount > 0) {
      // Send updated unread count
      const unreadCount = await getUnreadCount(userId);
      emitNotificationToUser(userId, {
        type: "UNREAD_COUNT",
        count: unreadCount,
      });
    }

    return updatedCount;
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    throw error;
  }
}

/**
 * Marks all notifications as read for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of notifications updated
 */
export async function markAllAsRead(userId) {
  try {
    const result = await query(
      `UPDATE notifications 
       SET read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND read = FALSE
       RETURNING id`,
      [userId]
    );

    if (result.rows.length > 0) {
      emitNotificationToUser(userId, {
        type: "UNREAD_COUNT",
        count: 0,
      });
    }

    return result.rows.length;
  } catch (error) {
    console.error("Error marking all as read:", error);
    throw error;
  }
}

/**
 * Dismisses notifications
 * @param {Array<string>} notificationIds - Notification IDs
 * @param {string} userId - User ID (for security)
 * @returns {Promise<number>} Number of notifications dismissed
 */
export async function dismissNotifications(notificationIds, userId) {
  try {
    const result = await query(
      `UPDATE notifications 
       SET dismissed = TRUE, dismissed_at = NOW()
       WHERE id = ANY($1) AND user_id = $2
       RETURNING id`,
      [notificationIds, userId]
    );

    return result.rows.length;
  } catch (error) {
    console.error("Error dismissing notifications:", error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

/**
 * Gets user notification preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User preferences
 */
export async function getUserPreferences(userId) {
  try {
    let result = await query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default preferences
      result = await query(
        `INSERT INTO notification_preferences (user_id)
         VALUES ($1)
         RETURNING *`,
        [userId]
      );
    }

    return formatPreferences(result.rows[0]);
  } catch (error) {
    console.error("Error getting user preferences:", error);
    throw error;
  }
}

/**
 * Updates user notification preferences
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences to update
 * @returns {Promise<Object>} Updated preferences
 */
export async function updateUserPreferences(userId, preferences) {
  try {
    const updates = [];
    const params = [userId];
    let paramCount = 1;

    const allowedFields = [
      "in_app_enabled",
      "email_enabled",
      "push_enabled",
      "enabled_types",
      "disabled_types",
      "min_severity",
      "quiet_hours_enabled",
      "quiet_hours_start",
      "quiet_hours_end",
      "quiet_hours_timezone",
    ];

    for (const [key, value] of Object.entries(preferences)) {
      if (allowedFields.includes(key)) {
        paramCount++;
        if (key === "enabled_types" || key === "disabled_types") {
          updates.push(`${key} = $${paramCount}::jsonb`);
          params.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramCount}`);
          params.push(value);
        }
      }
    }

    if (updates.length === 0) {
      return getUserPreferences(userId);
    }

    const result = await query(
      `INSERT INTO notification_preferences (user_id, ${updates
        .map((_, i) => allowedFields[i])
        .join(", ")})
       VALUES ($1, ${updates.map((_, i) => `$${i + 2}`).join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET
       ${updates.join(", ")}, updated_at = NOW()
       RETURNING *`,
      params
    );

    return formatPreferences(result.rows[0]);
  } catch (error) {
    console.error("Error updating user preferences:", error);
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats notification object
 */
function formatNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    shipmentId: row.shipment_id,
    segmentId: row.segment_id,
    packageId: row.package_id,
    breachId: row.breach_id,
    metadata: row.metadata || {},
    read: row.read,
    readAt: row.read_at,
    dismissed: row.dismissed,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Formats preferences object
 */
function formatPreferences(row) {
  return {
    userId: row.user_id,
    inAppEnabled: row.in_app_enabled,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
    enabledTypes: row.enabled_types || [],
    disabledTypes: row.disabled_types || [],
    minSeverity: row.min_severity,
    quietHoursEnabled: row.quiet_hours_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    quietHoursTimezone: row.quiet_hours_timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Cleans up old notifications (should be run periodically)
 */
export async function cleanupOldNotifications() {
  try {
    await query(`SELECT cleanup_old_notifications()`);
    console.log("✅ Old notifications cleaned up");
  } catch (error) {
    console.error("Error cleaning up notifications:", error);
  }
}
