import WebSocket from "ws";
import jwt from "jsonwebtoken";
import { jwtPublicKey } from "../config.js";

/**
 * WebSocket Notification Handler
 * Manages WebSocket connections for real-time notifications
 */

// Map to store user connections: userId -> Set of WebSocket connections
const userConnections = new Map();

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Handles new WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} request - HTTP request
 */
export function handleConnection(ws, request) {
  console.log("🔌 New WebSocket connection attempt");

  let userId = null;
  let isAuthenticated = false;

  // Handle authentication message
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "AUTH" && !isAuthenticated) {
        // Authenticate the connection
        const token = data.token;

        if (!token) {
          ws.send(
            JSON.stringify({
              type: "AUTH_ERROR",
              message: "No token provided",
            })
          );
          ws.close();
          return;
        }

        try {
          const decoded = jwt.verify(token, jwtPublicKey, {
            algorithms: ["RS256"],
          });
          userId = decoded.uuid; // Use UUID from token
          isAuthenticated = true;

          // Add connection to user's connection set
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId).add(ws);

          // Send authentication success
          ws.send(
            JSON.stringify({
              type: "AUTH_SUCCESS",
              userId: userId,
            })
          );

          console.log(`✅ WebSocket authenticated for user: ${userId}`);
        } catch (err) {
          console.error("❌ JWT verification failed:", err.message);
          ws.send(
            JSON.stringify({
              type: "AUTH_ERROR",
              message: "Invalid token",
            })
          );
          ws.close();
        }
      } else if (data.type === "PING" && isAuthenticated) {
        // Respond to ping
        ws.send(JSON.stringify({ type: "PONG" }));
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  });

  // Handle connection close
  ws.on("close", () => {
    if (userId && userConnections.has(userId)) {
      userConnections.get(userId).delete(ws);
      if (userConnections.get(userId).size === 0) {
        userConnections.delete(userId);
      }
      console.log(`🔌 WebSocket disconnected for user: ${userId}`);
    }
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Request authentication within 10 seconds
  setTimeout(() => {
    if (!isAuthenticated) {
      console.log("⏱️ WebSocket authentication timeout");
      ws.send(
        JSON.stringify({
          type: "AUTH_ERROR",
          message: "Authentication timeout",
        })
      );
      ws.close();
    }
  }, 10000);
}

// ============================================================================
// NOTIFICATION EMISSION
// ============================================================================

/**
 * Emits a notification to a specific user
 * @param {string} userId - User ID
 * @param {Object} data - Notification data
 */
export function emitNotificationToUser(userId, data) {
  if (!userConnections.has(userId)) {
    // User not connected
    return;
  }

  const connections = userConnections.get(userId);
  const message = JSON.stringify(data);

  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * Broadcasts a notification to all connected users
 * @param {Object} data - Notification data
 */
export function broadcastNotification(data) {
  const message = JSON.stringify(data);

  userConnections.forEach((connections) => {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  });
}

/**
 * Emits a notification to multiple users
 * @param {Array<string>} userIds - Array of user IDs
 * @param {Object} data - Notification data
 */
export function emitNotificationToUsers(userIds, data) {
  userIds.forEach((userId) => {
    emitNotificationToUser(userId, data);
  });
}

/**
 * Gets the number of active connections for a user
 * @param {string} userId - User ID
 * @returns {number} Number of active connections
 */
export function getUserConnectionCount(userId) {
  return userConnections.get(userId)?.size || 0;
}

/**
 * Gets total number of connected users
 * @returns {number} Number of connected users
 */
export function getConnectedUserCount() {
  return userConnections.size;
}

/**
 * Gets total number of active connections
 * @returns {number} Total connections
 */
export function getTotalConnectionCount() {
  let total = 0;
  userConnections.forEach((connections) => {
    total += connections.size;
  });
  return total;
}
