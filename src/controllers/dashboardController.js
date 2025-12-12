import { getManufacturerDashboardStats } from "../services/dashboardService.js";
import { handleControllerError } from "../http/responders/controllerErrorResponder.js";

/**
 * GET /api/dashboard/manufacturer
 * Get manufacturer dashboard statistics
 */
export async function getManufacturerDashboard(req, res) {
  try {
    const userId = req.userId;
    const userUUID = req.registration?.id;

    if (!userUUID) {
      return res.status(401).json({
        error: "User not authenticated or registration not found",
      });
    }

    const stats = await getManufacturerDashboardStats(userUUID, userId);
    return res.status(200).json(stats);
  } catch (err) {
    return handleControllerError(res, err, {
      logMessage: "Error fetching manufacturer dashboard",
      fallbackMessage: "Unable to fetch dashboard statistics",
    });
  }
}
