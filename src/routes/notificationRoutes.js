import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import * as notificationService from "../services/notificationService.js";

const router = express.Router();

/**
 * GET /api/notifications
 * Get notifications for authenticated user
 */
router.get("/", authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      unreadOnly = "false",
      limit = "50",
      offset = "0",
      type,
      severity,
      includeExpired = "false",
    } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      unreadOnly: unreadOnly === "true",
      limit: parseInt(limit),
      offset: parseInt(offset),
      type,
      severity,
      includeExpired: includeExpired === "true",
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get("/unread-count", authenticate, async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.userId);
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/read
 * Mark notifications as read
 * Body: { notificationIds: string[] }
 */
router.post("/read", authenticate, async (req, res, next) => {
  try {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        error: "notificationIds must be a non-empty array",
      });
    }

    const updatedCount = await notificationService.markAsRead(
      notificationIds,
      req.userId
    );

    res.json({ updatedCount });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post("/read-all", authenticate, async (req, res, next) => {
  try {
    const updatedCount = await notificationService.markAllAsRead(req.userId);
    res.json({ updatedCount });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/dismiss
 * Dismiss notifications
 * Body: { notificationIds: string[] }
 */
router.post("/dismiss", authenticate, async (req, res, next) => {
  try {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        error: "notificationIds must be a non-empty array",
      });
    }

    const dismissedCount = await notificationService.dismissNotifications(
      notificationIds,
      req.userId
    );

    res.json({ dismissedCount });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get("/preferences", authenticate, async (req, res, next) => {
  try {
    const preferences = await notificationService.getUserPreferences(
      req.userId
    );
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put("/preferences", authenticate, async (req, res, next) => {
  try {
    const preferences = await notificationService.updateUserPreferences(
      req.userId,
      req.body
    );
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

export default router;
