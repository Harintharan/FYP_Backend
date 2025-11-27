import db from "../db.js";

/**
 * Get complete package status including shipment chain and condition breaches
 */
export async function getPackageStatusWithBreaches(req, res) {
  const client = await db.connect();

  try {
    const { packageId } = req.params;

    // Get package details
    const packageQuery = `
      SELECT 
        p.id as package_uuid,
        p.status as package_accepted,
        p.batch_id,
        p.created_at as package_created_at,
        pr.name as product_name,
        pc.name as product_type,
        pr.required_start_temp as temperature_min_requirement,
        pr.required_end_temp as temperature_max_requirement
      FROM package_registry p
      LEFT JOIN batches b ON p.batch_id = b.id
      LEFT JOIN products pr ON b.product_id = pr.id
      LEFT JOIN product_categories pc ON pr.product_category_id = pc.id
      WHERE p.id = $1
    `;

    const packageResult = await client.query(packageQuery, [packageId]);

    if (packageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Package not found",
      });
    }

    const packageData = packageResult.rows[0];

    // Get shipment and shipment segment details
    const shipmentQuery = `
      SELECT 
        s.id as shipment_id,
        s.manufacturer_uuid,
        s.consumer_uuid,
        s.status as shipment_status,
        s.created_at as shipment_date,
        ss.id as segment_id,
        sc_start.name as from_location,
        sc_start.state as from_state,
        sc_start.country as from_country,
        sc_end.name as to_location,
        sc_end.state as to_state,
        sc_end.country as to_country,
        ss.status as segment_status,
        ss.supplier_id as carrier,
        ss.expected_ship_date,
        ss.estimated_arrival_date,
        ss.segment_order,
        ss.created_at as start_timestamp,
        ss.updated_at as end_timestamp
      FROM package_registry p
      LEFT JOIN shipment_registry s ON p.shipment_id = s.id
      LEFT JOIN shipment_segment ss ON s.id = ss.shipment_id
      LEFT JOIN checkpoint_registry sc_start ON ss.start_checkpoint_id = sc_start.id
      LEFT JOIN checkpoint_registry sc_end ON ss.end_checkpoint_id = sc_end.id
      WHERE p.id = $1
      ORDER BY ss.segment_order ASC
    `;

    const shipmentResult = await client.query(shipmentQuery, [packageId]);

    // Get all condition breaches for this package
    const breachQuery = `
      SELECT 
        cb.id as breach_uuid,
        cb.breach_type,
        cb.severity,
        cb.breach_start_time as detected_at,
        cb.resolved_at,
        cb.breach_certainty as status,
        cb.measured_avg_value as detected_value,
        cb.expected_min_value as threshold_min,
        cb.expected_max_value as threshold_max,
        cb.location_latitude as latitude,
        cb.location_longitude as longitude,
        cb.tx_hash,
        cb.pinata_cid,
        cb.created_at
      FROM condition_breaches cb
      WHERE cb.package_id = $1
      ORDER BY cb.breach_start_time DESC
    `;

    const breachResult = await client.query(breachQuery, [packageId]);

    // Structure the response
    const shipmentChain = [];
    if (shipmentResult.rows.length > 0 && shipmentResult.rows[0].shipment_id) {
      const shipment = shipmentResult.rows[0];
      shipmentChain.push({
        shipment_id: shipment.shipment_id,
        manufacturer_uuid: shipment.manufacturer_uuid,
        consumer_uuid: shipment.consumer_uuid,
        status: shipment.shipment_status,
        shipment_date: shipment.shipment_date,
        segments: shipmentResult.rows
          .filter((row) => row.segment_id !== null)
          .map((row) => ({
            segment_id: row.segment_id,
            from_location: {
              name: row.from_location,
              state: row.from_state,
              country: row.from_country,
            },
            to_location: {
              name: row.to_location,
              state: row.to_state,
              country: row.to_country,
            },
            status: row.segment_status,
            carrier: row.carrier,
            expected_ship_date: row.expected_ship_date,
            estimated_arrival_date: row.estimated_arrival_date,
            segment_order: row.segment_order,
            start_timestamp: row.start_timestamp,
            end_timestamp: row.end_timestamp,
          })),
      });
    }

    // Calculate breach statistics
    const breachStats = {
      total: breachResult.rows.length,
      byType: {},
      bySeverity: {},
      resolved: 0,
      active: 0,
    };

    breachResult.rows.forEach((breach) => {
      // Count by type
      breachStats.byType[breach.breach_type] =
        (breachStats.byType[breach.breach_type] || 0) + 1;

      // Count by severity
      breachStats.bySeverity[breach.severity] =
        (breachStats.bySeverity[breach.severity] || 0) + 1;

      // Count resolved vs active
      if (breach.resolved_at) {
        breachStats.resolved++;
      } else {
        breachStats.active++;
      }
    });

    return res.json({
      success: true,
      data: {
        package: {
          package_uuid: packageData.package_uuid,
          package_accepted: packageData.package_accepted,
          batch_id: packageData.batch_id,
          created_at: packageData.package_created_at,
          product: {
            name: packageData.product_name,
            type: packageData.product_type,
            temperature_requirements: {
              min: packageData.temperature_min_requirement,
              max: packageData.temperature_max_requirement,
            },
          },
        },
        shipment_chain: shipmentChain,
        breaches: {
          statistics: breachStats,
          records: breachResult.rows.map((breach) => ({
            breach_uuid: breach.breach_uuid,
            breach_type: breach.breach_type,
            severity: breach.severity,
            status: breach.status,
            detected_at: breach.detected_at,
            resolved_at: breach.resolved_at,
            detected_value: breach.detected_value,
            threshold: {
              min: breach.threshold_min,
              max: breach.threshold_max,
            },
            location:
              breach.latitude && breach.longitude
                ? {
                    latitude: breach.latitude,
                    longitude: breach.longitude,
                  }
                : null,
            blockchain: {
              tx_hash: breach.tx_hash,
              ipfs_cid: breach.pinata_cid,
            },
            created_at: breach.created_at,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching package status with breaches:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch package status",
      details: error.message,
    });
  } finally {
    client.release();
  }
}
