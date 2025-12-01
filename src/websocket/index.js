import { WebSocketServer } from "ws";
import { handleConnection } from "./notificationHandler.js";

/**
 * WebSocket Server Setup
 * Creates and configures the WebSocket server for real-time notifications
 */

let wss = null;

/**
 * Initializes WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 */
export function initializeWebSocketServer(httpServer) {
  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/notifications",
  });

  wss.on("connection", handleConnection);

  wss.on("error", (error) => {
    console.error("❌ WebSocket Server Error:", error);
  });

  console.log("✅ WebSocket server initialized at /ws/notifications");

  return wss;
}

/**
 * Gets the WebSocket server instance
 * @returns {WebSocketServer} WebSocket server
 */
export function getWebSocketServer() {
  return wss;
}

/**
 * Closes the WebSocket server
 */
export function closeWebSocketServer() {
  if (wss) {
    wss.close(() => {
      console.log("🔌 WebSocket server closed");
    });
  }
}
