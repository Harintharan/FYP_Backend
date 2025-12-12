/**
 * Dashboard Service
 * Provides aggregated data for dashboard views
 */

import { query } from "../db.js";

/**
 * Get manufacturer dashboard statistics
 * @param {string} manufacturerUUID - Manufacturer's UUID
 * @param {string} userId - User's ID for notifications
 * @returns {Promise<object>} Dashboard statistics
 */
export async function getManufacturerDashboardStats(manufacturerUUID, userId) {
  try {
    // Get product statistics
    const productsResult = await query(
      `SELECT COUNT(*) as total_products
       FROM products
       WHERE manufacturer_uuid = $1`,
      [manufacturerUUID]
    );

    // Get shipment statistics
    const shipmentsResult = await query(
      `SELECT 
         COUNT(*) as total_shipments,
         COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') as in_transit,
         COUNT(*) FILTER (WHERE status = 'PENDING') as preparing,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
         COUNT(*) FILTER (WHERE status = 'ACCEPTED') as accepted
       FROM shipment_registry
       WHERE manufacturer_uuid = $1::text`,
      [manufacturerUUID]
    );

    // Get notification/alert statistics
    const notificationsResult = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE read = FALSE AND dismissed = FALSE) as unread_count,
         COUNT(*) FILTER (WHERE severity IN ('ERROR', 'CRITICAL') AND read = FALSE) as critical_count
       FROM notifications
       WHERE user_id = $1`,
      [userId]
    );

    // Get recent shipments (last 10) with rich details
    const recentShipmentsResult = await query(
      `SELECT 
         sr.id,
         sr.status,
         sr.created_at,
         sr.updated_at,
         -- Destination info from last segment's end checkpoint
         final_dest.name as destination_name,
         final_dest.address as destination_address,
         final_dest.state as destination_state,
         final_dest.country as destination_country,
         -- Package count
         (SELECT COUNT(*) FROM package_registry pr WHERE pr.shipment_id = sr.id) as package_count,
         -- Route segments with checkpoint details
         (
           SELECT json_agg(
             json_build_object(
               'segment_id', ss.id,
               'start_checkpoint', json_build_object(
                 'id', start_cp.id,
                 'name', start_cp.name,
                 'location', start_cp.address,
                 'state', start_cp.state,
                 'country', start_cp.country
               ),
               'end_checkpoint', json_build_object(
                 'id', end_cp.id,
                 'name', end_cp.name,
                 'location', end_cp.address,
                 'state', end_cp.state,
                 'country', end_cp.country
               ),
               'estimated_arrival', ss.estimated_arrival_date,
               'status', ss.status,
               'segment_order', ss.segment_order
             ) ORDER BY ss.segment_order
           )
           FROM shipment_segment ss
           LEFT JOIN checkpoint_registry start_cp ON ss.start_checkpoint_id = start_cp.id
           LEFT JOIN checkpoint_registry end_cp ON ss.end_checkpoint_id = end_cp.id
           WHERE ss.shipment_id = sr.id
         ) as segments,
         -- Latest segment info for quick access
         (
           SELECT ss.estimated_arrival_date
           FROM shipment_segment ss
           WHERE ss.shipment_id = sr.id
           ORDER BY ss.segment_order DESC
           LIMIT 1
         ) as estimated_delivery
       FROM shipment_registry sr
       -- Get the final destination from the last segment's end checkpoint
       LEFT JOIN LATERAL (
         SELECT 
           cr.name,
           cr.address,
           cr.state,
           cr.country
         FROM shipment_segment ss
         JOIN checkpoint_registry cr ON ss.end_checkpoint_id = cr.id
         WHERE ss.shipment_id = sr.id
         ORDER BY ss.segment_order DESC
         LIMIT 1
       ) final_dest ON true
       WHERE sr.manufacturer_uuid = $1::text
       ORDER BY sr.created_at DESC
       LIMIT 10`,
      [manufacturerUUID]
    );

    // Get recent notifications (last 10 unread)
    const recentNotificationsResult = await query(
      `SELECT 
         id,
         type,
         severity,
         title,
         message,
         created_at,
         read,
         shipment_id,
         segment_id,
         package_id,
         breach_id,
         metadata
       FROM notifications
       WHERE user_id = $1
         AND read = FALSE
         AND dismissed = FALSE
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const products = productsResult.rows[0];
    const shipments = shipmentsResult.rows[0];
    const notifications = notificationsResult.rows[0];

    return {
      stats: {
        totalProducts: parseInt(products.total_products) || 0,
        totalShipments: parseInt(shipments.total_shipments) || 0,
        activeShipments: parseInt(shipments.in_transit) || 0,
        preparingShipments: parseInt(shipments.preparing) || 0,
        deliveredShipments: parseInt(shipments.delivered) || 0,
        acceptedShipments: parseInt(shipments.accepted) || 0,
        unreadNotifications: parseInt(notifications.unread_count) || 0,
        criticalAlerts: parseInt(notifications.critical_count) || 0,
      },
      recentShipments: recentShipmentsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        destinationName: row.destination_name || "Destination Not Set",
        destinationAddress: row.destination_address,
        destinationState: row.destination_state,
        destinationCountry: row.destination_country,
        packageCount: parseInt(row.package_count) || 0,
        segments: row.segments || [],
        estimatedDelivery: row.estimated_delivery,
      })),
      recentNotifications: recentNotificationsResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        message: row.message,
        timestamp: row.created_at,
        read: row.read,
        shipmentId: row.shipment_id,
        segmentId: row.segment_id,
        packageId: row.package_id,
        breachId: row.breach_id,
        metadata: row.metadata,
      })),
    };
  } catch (error) {
    console.error("Error fetching manufacturer dashboard stats:", error);
    throw error;
  }
}

/**
 * Get supplier dashboard statistics
 * @param {string} supplierUUID - Supplier's UUID
 * @param {string} userId - User's ID for notifications
 * @returns {Promise<object>} Dashboard statistics
 */
export async function getSupplierDashboardStats(supplierUUID, userId) {
  try {
    // Get shipment-segment statistics (suppliers manage shipment segments)
    const segmentsResult = await query(
      `SELECT 
         COUNT(*) as total_segments,
         COUNT(*) FILTER (WHERE ss.status = 'DELIVERED') as delivered_segments,
         COUNT(*) FILTER (WHERE ss.status = 'IN_TRANSIT') as in_transit_segments
       FROM shipment_segment ss
       WHERE ss.supplier_id = $1::uuid`,
      [supplierUUID]
    );

    // Get notification/alert statistics
    const notificationsResult = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE read = FALSE AND dismissed = FALSE) as unread_count,
         COUNT(*) FILTER (WHERE severity IN ('ERROR', 'CRITICAL') AND read = FALSE) as critical_count
       FROM notifications
       WHERE user_id = $1`,
      [userId]
    );

    // Get recent shipments (last 10) with rich details
    const recentShipmentsResult = await query(
      `SELECT 
         sr.id,
         sr.status,
         sr.created_at,
         sr.updated_at,
         -- Destination info from last segment's end checkpoint
         final_dest.name as destination_name,
         final_dest.address as destination_address,
         final_dest.state as destination_state,
         final_dest.country as destination_country,
         -- Package count
         (SELECT COUNT(*) FROM package_registry pr WHERE pr.shipment_id = sr.id) as package_count,
         -- Route segments with checkpoint details
         (
           SELECT json_agg(
             json_build_object(
               'segment_id', ss.id,
               'start_checkpoint', json_build_object(
                 'id', start_cp.id,
                 'name', start_cp.name,
                 'location', start_cp.address,
                 'state', start_cp.state,
                 'country', start_cp.country
               ),
               'end_checkpoint', json_build_object(
                 'id', end_cp.id,
                 'name', end_cp.name,
                 'location', end_cp.address,
                 'state', end_cp.state,
                 'country', end_cp.country
               ),
               'estimated_arrival', ss.estimated_arrival_date,
               'status', ss.status,
               'segment_order', ss.segment_order
             ) ORDER BY ss.segment_order
           )
           FROM shipment_segment ss
           LEFT JOIN checkpoint_registry start_cp ON ss.start_checkpoint_id = start_cp.id
           LEFT JOIN checkpoint_registry end_cp ON ss.end_checkpoint_id = end_cp.id
           WHERE ss.shipment_id = sr.id
         ) as segments,
         -- Latest segment info for quick access
         (
           SELECT ss.estimated_arrival_date
           FROM shipment_segment ss
           WHERE ss.shipment_id = sr.id
           ORDER BY ss.segment_order DESC
           LIMIT 1
         ) as estimated_delivery
       FROM shipment_registry sr
       -- Get the final destination from the last segment's end checkpoint
       LEFT JOIN LATERAL (
         SELECT 
           cr.name,
           cr.address,
           cr.state,
           cr.country
         FROM shipment_segment ss
         JOIN checkpoint_registry cr ON ss.end_checkpoint_id = cr.id
         WHERE ss.shipment_id = sr.id
         ORDER BY ss.segment_order DESC
         LIMIT 1
       ) final_dest ON true
       WHERE sr.id IN (
         SELECT DISTINCT shipment_id 
         FROM shipment_segment 
         WHERE supplier_id = $1::uuid
       )
       ORDER BY sr.created_at DESC
       LIMIT 10`,
      [supplierUUID]
    );

    // Get recent notifications (last 10 unread)
    const recentNotificationsResult = await query(
      `SELECT 
         id,
         type,
         severity,
         title,
         message,
         created_at,
         read,
         shipment_id,
         segment_id,
         package_id,
         breach_id,
         metadata
       FROM notifications
       WHERE user_id = $1
         AND read = FALSE
         AND dismissed = FALSE
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const segments = segmentsResult.rows[0];
    const notifications = notificationsResult.rows[0];

    return {
      stats: {
        totalSegments: parseInt(segments.total_segments) || 0,
        deliveredSegments: parseInt(segments.delivered_segments) || 0,
        inTransitSegments: parseInt(segments.in_transit_segments) || 0,
        unreadNotifications: parseInt(notifications.unread_count) || 0,
        criticalAlerts: parseInt(notifications.critical_count) || 0,
      },
      recentShipments: recentShipmentsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        destinationName: row.destination_name || "Destination Not Set",
        destinationAddress: row.destination_address,
        destinationState: row.destination_state,
        destinationCountry: row.destination_country,
        packageCount: parseInt(row.package_count) || 0,
        segments: row.segments || [],
        estimatedDelivery: row.estimated_delivery,
      })),
      recentNotifications: recentNotificationsResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        message: row.message,
        timestamp: row.created_at,
        read: row.read,
        shipmentId: row.shipment_id,
        segmentId: row.segment_id,
        packageId: row.package_id,
        breachId: row.breach_id,
        metadata: row.metadata,
      })),
    };
  } catch (error) {
    console.error("Error fetching supplier dashboard stats:", error);
    throw error;
  }
}
