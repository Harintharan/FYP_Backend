import { query } from "../db.js";

/**
 * Get alerts for manufacturer
 * Shows all condition breaches for packages manufactured by this user
 * with pagination and search capabilities
 */
export async function getManufacturerAlerts(req, res) {
  try {

    const userUuid = req.userId;
    if (!userUuid) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build parameters
    const params = [userUuid];
    let paramIndex = 2;
    let searchCondition = "";

    if (search) {
      searchCondition = ` AND (
        pr.id::text ILIKE $${paramIndex} OR
        cb.breach_type ILIKE $${paramIndex} OR
        cb.shipment_id::text ILIKE $${paramIndex} OR
        cb.id::text ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Query to get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM condition_breaches cb
      JOIN package_registry pr ON cb.package_id = pr.id
      WHERE pr.manufacturer_uuid = $1
      ${searchCondition}
    `;

    const countParams = [userUuid];
    if (search) countParams.push(`%${search}%`);

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Add offset and limit parameters for alerts query
    params.push(offset);
    params.push(parseInt(limit));

    // Query to get alerts
    const alertsQuery = `
      SELECT 
        pr.id as package_id,
        cb.id as breach_id,
        cb.breach_type,
        cb.severity,
        cb.breach_start_time,
        cb.location_latitude,
        cb.location_longitude,
        cb.shipment_id,
        cb.measured_avg_value,
        cb.expected_min_value,
        cb.expected_max_value,
        pr.status as package_status,
        pr.created_at as package_created_at
      FROM condition_breaches cb
      JOIN package_registry pr ON cb.package_id = pr.id
      WHERE pr.manufacturer_uuid = $1
      ${searchCondition}
      ORDER BY cb.breach_start_time DESC
      OFFSET $${paramIndex}
      LIMIT $${paramIndex + 1}
    `;

    const alertsResult = await query(alertsQuery, params);

    // Transform alert type and severity for frontend
    const alerts = alertsResult.rows.map((alert) => ({
      packageId: alert.package_id,
      breachId: alert.breach_id,
      alertType:
        alert.breach_type === "DOOR_TAMPER"
          ? "Unauthorized Access"
          : alert.breach_type === "TEMPERATURE_EXCURSION"
          ? "Temperature Excursion"
          : alert.breach_type,
      severity: alert.breach_type === "DOOR_TAMPER" ? "CRITICAL" : "WARNING",
      breachTime: alert.breach_start_time,
      shipmentId: alert.shipment_id,
      location: {
        latitude: parseFloat(alert.location_latitude),
        longitude: parseFloat(alert.location_longitude),
      },
      measuredValue: alert.measured_avg_value,
      minValue: alert.expected_min_value,
      maxValue: alert.expected_max_value,
      packageStatus: alert.package_status,
      packageCreatedAt: alert.package_created_at,
    }));

    res.json({
      success: true,
      data: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching manufacturer alerts:", error);
    res.status(500).json({ error: "Failed to fetch manufacturer alerts" });
  }
}

/**
 * Get alerts for supplier
 * Shows all condition breaches that occurred during IN_TRANSIT segments
 * for packages this supplier is/was transporting
 * with pagination and search capabilities
 */
export async function getSupplierAlerts(req, res) {
  try {

    const userUuid = req.userId;
    if (!userUuid) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build parameters
    const params = [userUuid];
    let paramIndex = 2;
    let searchCondition = "";

    if (search) {
      searchCondition = ` AND (
        cb.package_id::text ILIKE $${paramIndex} OR
        cb.breach_type ILIKE $${paramIndex} OR
        ss.id::text ILIKE $${paramIndex} OR
        cb.id::text ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Query to get total count - SIMPLIFIED with direct segment_id lookup
    const countQuery = `
      SELECT COUNT(DISTINCT cb.id) as total
      FROM condition_breaches cb
      JOIN shipment_segment ss ON cb.segment_id = ss.id
      WHERE ss.supplier_id = $1
      ${searchCondition}
    `;

    const countParams = [userUuid];
    if (search) countParams.push(`%${search}%`);

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Add offset and limit parameters for alerts query
    params.push(offset);
    params.push(parseInt(limit));

    // Query to get alerts
    const alertsQuery = `
      SELECT DISTINCT
        cb.id as breach_id,
        cb.package_id,
        cb.breach_type,
        cb.severity,
        cb.breach_start_time,
        cb.location_latitude,
        cb.location_longitude,
        cb.segment_id,
        ss.status as segment_status,
        cb.measured_avg_value,
        cb.expected_min_value,
        cb.expected_max_value
      FROM condition_breaches cb
      JOIN shipment_segment ss ON cb.segment_id = ss.id
      WHERE ss.supplier_id = $1
      ${searchCondition}
      ORDER BY cb.breach_start_time DESC
      OFFSET $${paramIndex}
      LIMIT $${paramIndex + 1}
    `;

    const alertsResult = await query(alertsQuery, params);

    // Transform alert type and severity for frontend
    const alerts = alertsResult.rows.map((alert) => ({
      packageId: alert.package_id,
      breachId: alert.breach_id,
      alertType:
        alert.breach_type === "DOOR_TAMPER"
          ? "Unauthorized Access"
          : alert.breach_type === "TEMPERATURE_EXCURSION"
          ? "Temperature Excursion"
          : alert.breach_type,
      severity: alert.breach_type === "DOOR_TAMPER" ? "CRITICAL" : "WARNING",
      breachTime: alert.breach_start_time,
      segmentId: alert.segment_id,
      shipmentId: alert.shipment_id,
      location: {
        latitude: parseFloat(alert.location_latitude),
        longitude: parseFloat(alert.location_longitude),
      },
      measuredValue: alert.measured_avg_value,
      minValue: alert.expected_min_value,
      maxValue: alert.expected_max_value,
    }));

    res.json({
      success: true,
      data: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching supplier alerts:", error);
    res.status(500).json({ error: "Failed to fetch supplier alerts" });
  }
}
