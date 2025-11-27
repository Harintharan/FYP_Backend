import { deleteExpiredRefreshTokens } from "../models/authModel.js";

/**
 * Cleanup utility for expired and revoked refresh tokens
 * This should be run periodically (e.g., daily via cron job)
 */
export async function cleanupExpiredTokens() {
  try {
    // console.log("Starting refresh token cleanup...");
    const deletedCount = await deleteExpiredRefreshTokens();
    // console.log(`✓ Cleaned up ${deletedCount} expired/revoked tokens`);
    return deletedCount;
  } catch (error) {
    console.error("Error during token cleanup:", error);
    throw error;
  }
}

/**
 * Start automatic cleanup process
 * @param {number} intervalHours - How often to run cleanup (in hours)
 */
export function startAutomaticCleanup(intervalHours = 24) {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // console.log(
  //   `Starting automatic token cleanup every ${intervalHours} hours...`
  // );

  // Run immediately on startup
  cleanupExpiredTokens().catch(console.error);

  // Then run on interval
  const intervalId = setInterval(() => {
    cleanupExpiredTokens().catch(console.error);
  }, intervalMs);

  return intervalId;
}

// If running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupExpiredTokens()
    .then((count) => {
      console.log(`Cleanup completed. Deleted ${count} tokens.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Cleanup failed:", error);
      process.exit(1);
    });
}
