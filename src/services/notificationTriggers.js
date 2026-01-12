import * as notificationService from "./notificationService.js";
import { getShipmentById } from "../models/ShipmentRegistryModel.js";
import { findShipmentSegmentById } from "../models/ShipmentSegmentModel.js";

/**
 * Notification Triggers
 * Centralized functions for triggering notifications based on business events
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user by identifier (tries UUID first, then wallet address)
 */
async function getUserByIdentifier(query, identifier) {
  if (!identifier) {
    console.log(`❌ getUserByIdentifier called with null/undefined identifier`);
    return null;
  }

  console.log(`🔍 getUserByIdentifier looking for: ${identifier}`);

  // First try as direct UUID (shipment_registry stores UUIDs)
  let result = await query(
    `SELECT id, payload FROM users WHERE id = $1::uuid`,
    [identifier]
  );

  console.log(`   UUID lookup returned ${result.rows.length} rows`);

  if (result.rows.length === 0) {
    // Try as public key (wallet address) as fallback
    result = await query(
      `SELECT id, payload FROM users WHERE public_key = $1`,
      [identifier]
    );
    console.log(`   Public key lookup returned ${result.rows.length} rows`);
  }

  if (result.rows.length > 0) {
    console.log(`   ✅ Found user: ${result.rows[0].id}`);
  } else {
    console.log(`   ❌ User not found`);
  }

  return result.rows[0] || null;
}

// ============================================================================
// SHIPMENT NOTIFICATIONS
// ============================================================================

/**
 * Notifies when a new shipment is created
 */
export async function notifyShipmentCreated(shipmentId, createdByUserId) {
  try {
    const shipment = await getShipmentById(shipmentId);
    if (!shipment) return;

    // Get user IDs from wallet addresses
    const { query } = await import("../db.js");

    const [manufacturerData, consumerData, segmentCountResult] =
      await Promise.all([
        getUserByIdentifier(query, shipment.manufacturer_uuid),
        getUserByIdentifier(query, shipment.consumer_uuid),
        query(
          `SELECT COUNT(*) as segment_count FROM shipment_segment WHERE shipment_id = $1`,
          [shipmentId]
        ),
      ]);

    const segmentCount = parseInt(
      segmentCountResult.rows[0]?.segment_count || 0
    );

    const recipients = [];
    if (manufacturerData?.id && manufacturerData.id !== createdByUserId) {
      recipients.push(manufacturerData.id);
    }
    if (consumerData?.id && consumerData.id !== createdByUserId) {
      recipients.push(consumerData.id);
    }

    if (recipients.length === 0) {
      console.log("⏭️ No users found to notify for shipment creation", {
        manufacturer: shipment.manufacturer_uuid,
        consumer: shipment.consumer_uuid,
        manufacturerFound: !!manufacturerData,
        consumerFound: !!consumerData,
      });
      return;
    }

    // Get company names
    const manufacturerName =
      manufacturerData?.payload?.identification?.legalName ||
      manufacturerData?.payload?.identification?.companyName ||
      "Manufacturer";
    const consumerName =
      consumerData?.payload?.identification?.legalName ||
      consumerData?.payload?.identification?.companyName ||
      "Consumer";

    // Determine who is receiving the notification and customize message
    const notificationPromises = recipients.map((recipientId) => {
      const isManufacturer = recipientId === manufacturerData?.id;
      const partnerName = isManufacturer ? consumerName : manufacturerName;

      // Create attractive segment text with number words
      const numberWords = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
      ];
      const segmentWord =
        segmentCount <= 10 ? numberWords[segmentCount] : segmentCount;
      const segmentText =
        segmentCount === 1 ? "one segment" : `${segmentWord} segments`;

      // Customize message based on role
      const message = isManufacturer
        ? `A new shipment with ${segmentText} has been created for ${partnerName}`
        : `A new shipment with ${segmentText} has been created by ${partnerName}`;

      return notificationService.createBulkNotifications([recipientId], {
        type: notificationService.NotificationType.SHIPMENT_CREATED,
        severity: notificationService.NotificationSeverity.INFO,
        title: "New Shipment Created",
        message,
        shipmentId,
        metadata: {
          shipment_id: shipmentId,
          consumer_name: consumerName,
          manufacturer_name: manufacturerName,
        },
      });
    });

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error("Failed to send shipment created notification:", error);
  }
}

/**
 * Notifies when a shipment is accepted
 */
export async function notifyShipmentAccepted(shipmentId) {
  try {
    const shipment = await getShipmentById(shipmentId);
    if (!shipment) return;

    const { query } = await import("../db.js");

    const [manufacturerData, consumerData, segmentsResult] = await Promise.all([
      getUserByIdentifier(query, shipment.manufacturer_uuid),
      getUserByIdentifier(query, shipment.consumer_uuid),
      query(
        `SELECT 
          ss.segment_order,
          ss.expected_ship_date,
          ss.estimated_arrival_date,
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          end_cp.name AS end_name,
          end_cp.state AS end_state
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.shipment_id = $1
         ORDER BY ss.segment_order ASC`,
        [shipmentId]
      ),
    ]);

    const segments = segmentsResult.rows;

    const recipients = [manufacturerData?.id, consumerData?.id].filter(Boolean);

    if (recipients.length === 0 || segments.length === 0) return;

    // Get first and last segment details
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const startCheckpoint = firstSegment.start_name
      ? `${firstSegment.start_name}${
          firstSegment.start_state ? ", " + firstSegment.start_state : ""
        }`
      : "Start Location";

    const endCheckpoint = lastSegment.end_name
      ? `${lastSegment.end_name}${
          lastSegment.end_state ? ", " + lastSegment.end_state : ""
        }`
      : "End Location";

    await notificationService.createBulkNotifications(recipients, {
      type: notificationService.NotificationType.SHIPMENT_ACCEPTED,
      severity: notificationService.NotificationSeverity.SUCCESS,
      title: "Shipment Accepted",
      message: `Shipment #${shipmentId} has been accepted and is ready for transit`,
      shipmentId,
      metadata: {
        shipment_id: shipmentId,
        start_checkpoint: startCheckpoint,
        end_checkpoint: endCheckpoint,
        expected_ship_date: firstSegment.expected_ship_date,
        estimated_arrival_date: lastSegment.estimated_arrival_date,
      },
    });
  } catch (error) {
    console.error("Failed to send shipment accepted notification:", error);
  }
}

/**
 * Notifies when a shipment is in transit
 */
export async function notifyShipmentInTransit(shipmentId) {
  try {
    const shipment = await getShipmentById(shipmentId);
    if (!shipment) return;

    const { query } = await import("../db.js");

    const [manufacturerData, consumerData, segmentsResult] = await Promise.all([
      getUserByIdentifier(query, shipment.manufacturer_uuid),
      getUserByIdentifier(query, shipment.consumer_uuid),
      query(
        `SELECT 
          ss.segment_order,
          ss.expected_ship_date,
          ss.estimated_arrival_date,
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          end_cp.name AS end_name,
          end_cp.state AS end_state
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.shipment_id = $1
         ORDER BY ss.segment_order ASC`,
        [shipmentId]
      ),
    ]);

    const segments = segmentsResult.rows;

    const recipients = [manufacturerData?.id, consumerData?.id].filter(Boolean);

    if (recipients.length === 0 || segments.length === 0) return;

    // Get first and last segment details
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const startCheckpoint = firstSegment.start_name
      ? `${firstSegment.start_name}${
          firstSegment.start_state ? ", " + firstSegment.start_state : ""
        }`
      : "Start Location";

    const endCheckpoint = lastSegment.end_name
      ? `${lastSegment.end_name}${
          lastSegment.end_state ? ", " + lastSegment.end_state : ""
        }`
      : "End Location";

    await notificationService.createBulkNotifications(recipients, {
      type: notificationService.NotificationType.SHIPMENT_IN_TRANSIT,
      severity: notificationService.NotificationSeverity.INFO,
      title: "Shipment In Transit",
      message: `Shipment #${shipmentId} is now in transit`,
      shipmentId,
      metadata: {
        shipment_id: shipmentId,
        start_checkpoint: startCheckpoint,
        end_checkpoint: endCheckpoint,
        expected_ship_date: firstSegment.expected_ship_date,
        estimated_arrival_date: lastSegment.estimated_arrival_date,
      },
    });
  } catch (error) {
    console.error("Failed to send shipment in transit notification:", error);
  }
}

/**
 * Notifies when a shipment is delivered
 * @param {string} shipmentId - The shipment ID
 * @param {Array} segments - Optional pre-fetched segments (for use within transactions)
 */
export async function notifyShipmentDelivered(shipmentId, segments = null) {
  try {
    console.log(`📢 notifyShipmentDelivered called for shipment ${shipmentId}`);

    const shipment = await getShipmentById(shipmentId);
    if (!shipment) {
      console.log(`❌ Shipment not found: ${shipmentId}`);
      return;
    }

    console.log(`📦 Shipment found:`, {
      id: shipment.id,
      status: shipment.status,
      manufacturer_uuid: shipment.manufacturer_uuid,
      consumer_uuid: shipment.consumer_uuid,
    });

    const { query } = await import("../db.js");

    // Use pre-fetched segments if provided, otherwise query database
    let allSegments;
    if (segments && Array.isArray(segments) && segments.length > 0) {
      console.log(`✅ Using provided segments (${segments.length} segments)`);
      allSegments = segments;
    } else {
      console.log(`📥 Querying segments from database...`);
      const allSegmentsResult = await query(
        `SELECT id, status FROM shipment_segment WHERE shipment_id = $1 ORDER BY segment_order ASC`,
        [shipmentId]
      );
      allSegments = allSegmentsResult.rows;
    }

    console.log(
      `📊 Segment statuses:`,
      allSegments.map((s) => ({ id: s.id, status: s.status }))
    );

    if (allSegments.length === 0) {
      console.log(`❌ No segments found for shipment ${shipmentId}`);
      return;
    }

    // Check if all segments are delivered or closed (case-insensitive)
    const allDelivered = allSegments.every((seg) => {
      const status =
        typeof seg.status === "string" ? seg.status.trim().toUpperCase() : "";
      const isDelivered = status === "DELIVERED" || status === "CLOSED";
      console.log(
        `   📦 Segment ${seg.id}: ${seg.status} -> ${status} -> ${
          isDelivered ? "✅" : "❌"
        }`
      );
      return isDelivered;
    });

    if (!allDelivered) {
      const pending = allSegments.filter((s) => {
        const status =
          typeof s.status === "string" ? s.status.trim().toUpperCase() : "";
        return status !== "DELIVERED" && status !== "CLOSED";
      });
      console.log(
        `⏭️ Not all segments delivered for shipment ${shipmentId}, skipping notification. Pending: ${pending
          .map((p) => p.status)
          .join(", ")}`
      );
      return;
    }

    console.log(`✅ All segments delivered/closed, getting user details...`);

    const [manufacturerData, consumerData] = await Promise.all([
      getUserByIdentifier(query, shipment.manufacturer_uuid),
      getUserByIdentifier(query, shipment.consumer_uuid),
    ]);

    console.log(`👥 User lookup results:`, {
      manufacturerFound: !!manufacturerData,
      consumerFound: !!consumerData,
      manufacturerId: manufacturerData?.id,
      consumerId: consumerData?.id,
    });

    const recipients = [manufacturerData?.id, consumerData?.id].filter(Boolean);

    if (recipients.length === 0) {
      console.log(`❌ No valid recipients found for shipment ${shipmentId}`);
      return;
    }

    console.log(
      `📨 Sending notification to ${recipients.length} recipients:`,
      recipients
    );

    await notificationService.createBulkNotifications(recipients, {
      type: notificationService.NotificationType.SHIPMENT_DELIVERED,
      severity: notificationService.NotificationSeverity.SUCCESS,
      title: "Shipment Delivered",
      message: `Shipment #${shipmentId} has been successfully delivered`,
      shipmentId,
      metadata: {
        total_segments: allSegments.length,
      },
    });

    console.log(`✅ Shipment delivered notification sent for ${shipmentId}`);
  } catch (error) {
    console.error("❌ Failed to send shipment delivered notification:", error);
  }
}

// ============================================================================
// SEGMENT NOTIFICATIONS
// ============================================================================

/**
 * Notifies when a segment is assigned to a supplier
 */
export async function notifySegmentAssigned(segmentId, supplierId) {
  try {
    const segment = await findShipmentSegmentById(segmentId);
    if (!segment) return;

    await notificationService.createNotification({
      userId: supplierId,
      type: notificationService.NotificationType.SEGMENT_ASSIGNED,
      severity: notificationService.NotificationSeverity.INFO,
      title: "New Segment Assigned",
      message: `You have been assigned to shipment segment #${segmentId.slice(
        0,
        8
      )}`,
      segmentId,
      shipmentId: segment.shipment_id,
    });

    // Notify shipment stakeholders
    const shipment = await getShipmentById(segment.shipment_id);
    if (shipment) {
      await notificationService.createBulkNotifications(
        [shipment.manufacturer_id, shipment.consumer_id],
        {
          type: notificationService.NotificationType.SEGMENT_ASSIGNED,
          severity: notificationService.NotificationSeverity.INFO,
          title: "Segment Assigned",
          message: `Segment #${segment.segment_order} has been assigned to a supplier`,
          segmentId,
          shipmentId: segment.shipment_id,
        }
      );
    }
  } catch (error) {
    console.error("Failed to send segment assigned notification:", error);
  }
}

/**
 * Notifies when a segment is accepted by a supplier
 */
export async function notifySegmentAccepted(segmentId, supplierId) {
  try {
    const segment = await findShipmentSegmentById(segmentId);
    if (!segment) return;

    const shipment = await getShipmentById(segment.shipment_id);
    if (!shipment) return;

    const { query } = await import("../db.js");

    // Fetch all required data in parallel
    const [
      manufacturerResult,
      consumerResult,
      supplierResult,
      checkpointsResult,
    ] = await Promise.all([
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.consumer_uuid,
      ]),
      query(`SELECT payload FROM users WHERE id = $1`, [supplierId]),
      query(
        `SELECT 
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          start_cp.country AS start_country,
          end_cp.name AS end_name,
          end_cp.state AS end_state,
          end_cp.country AS end_country
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.id = $1`,
        [segmentId]
      ),
    ]);

    // Get supplier name
    const supplierName =
      supplierResult.rows[0]?.payload?.identification?.legalName ||
      supplierResult.rows[0]?.payload?.identification?.companyName ||
      "Supplier";

    // Get checkpoint details
    const checkpointData = checkpointsResult.rows[0];
    const startLocation = checkpointData?.start_name
      ? `${checkpointData.start_name}${
          checkpointData.start_state ? ", " + checkpointData.start_state : ""
        }`
      : `Checkpoint ${segment.segment_order}`;
    const endLocation = checkpointData?.end_name
      ? `${checkpointData.end_name}${
          checkpointData.end_state ? ", " + checkpointData.end_state : ""
        }`
      : `Checkpoint ${segment.segment_order + 1}`;

    // Notify manufacturer (shipment owner)
    const manufacturerId = manufacturerResult.rows[0]?.id;
    if (manufacturerId) {
      await notificationService.createNotification({
        userId: manufacturerId,
        type: notificationService.NotificationType.SEGMENT_ACCEPTED,
        severity: notificationService.NotificationSeverity.SUCCESS,
        title: "Segment Acceptance Confirmed",
        message: `Shipment Segment #${segmentId} has been accepted and is ready for transit`,
        segmentId,
        shipmentId: segment.shipment_id,
        metadata: {
          supplier_id: supplierId,
          supplier_name: supplierName,
          segment_order: segment.segment_order,
          start_checkpoint: startLocation,
          end_checkpoint: endLocation,
          expected_ship_date: segment.expected_ship_date,
          estimated_arrival_date: segment.estimated_arrival_date,
        },
      });
    }

    // Notify consumer
    const consumerId = consumerResult.rows[0]?.id;
    if (consumerId && consumerId !== manufacturerId) {
      await notificationService.createNotification({
        userId: consumerId,
        type: notificationService.NotificationType.SEGMENT_ACCEPTED,
        severity: notificationService.NotificationSeverity.SUCCESS,
        title: "Segment Acceptance Confirmed",
        message: `Shipment Segment #${segmentId} has been accepted and is ready for transit`,
        segmentId,
        shipmentId: segment.shipment_id,
        metadata: {
          supplier_id: supplierId,
          supplier_name: supplierName,
          segment_order: segment.segment_order,
          start_checkpoint: startLocation,
          end_checkpoint: endLocation,
          expected_ship_date: segment.expected_ship_date,
          estimated_arrival_date: segment.estimated_arrival_date,
        },
      });
    }
  } catch (error) {
    console.error("Failed to send segment accepted notification:", error);
  }
}

/**
 * Notifies when a segment takeover occurs
 */
export async function notifySegmentTakeover(segmentId, supplierId) {
  try {
    const segment = await findShipmentSegmentById(segmentId);
    if (!segment) return;

    const shipment = await getShipmentById(segment.shipment_id);
    if (!shipment) return;

    const { query } = await import("../db.js");

    // Fetch all required data in parallel
    const [
      manufacturerResult,
      consumerResult,
      supplierResult,
      checkpointsResult,
    ] = await Promise.all([
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.consumer_uuid,
      ]),
      query(`SELECT payload FROM users WHERE id = $1`, [supplierId]),
      query(
        `SELECT 
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          end_cp.name AS end_name,
          end_cp.state AS end_state
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.id = $1`,
        [segmentId]
      ),
    ]);

    const stakeholderRecipients = [
      manufacturerResult.rows[0]?.id,
      consumerResult.rows[0]?.id,
    ].filter(Boolean);

    if (stakeholderRecipients.length === 0) return;

    // Get supplier name
    const supplierName =
      supplierResult.rows[0]?.payload?.identification?.legalName ||
      supplierResult.rows[0]?.payload?.identification?.companyName ||
      "Supplier";

    // Get checkpoint details
    const checkpointData = checkpointsResult.rows[0];
    const startLocation = checkpointData?.start_name
      ? `${checkpointData.start_name}${
          checkpointData.start_state ? ", " + checkpointData.start_state : ""
        }`
      : `Checkpoint ${segment.segment_order}`;
    const endLocation = checkpointData?.end_name
      ? `${checkpointData.end_name}${
          checkpointData.end_state ? ", " + checkpointData.end_state : ""
        }`
      : `Checkpoint ${segment.segment_order + 1}`;

    // Notify stakeholders (manufacturer and consumer)
    await notificationService.createBulkNotifications(stakeholderRecipients, {
      type: notificationService.NotificationType.SEGMENT_TAKEOVER,
      severity: notificationService.NotificationSeverity.INFO,
      title: "Segment Picked Up",
      message: `Shipment Segment #${segmentId} has been picked up and is in transit`,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
        supplier_id: supplierId,
        supplier_name: supplierName,
        start_checkpoint: startLocation,
        end_checkpoint: endLocation,
        expected_ship_date: segment.expected_ship_date,
        estimated_arrival_date: segment.estimated_arrival_date,
      },
    });
  } catch (error) {
    console.error("Failed to send segment takeover notification:", error);
  }
}

/**
 * Notifies when a segment handover occurs
 */
export async function notifySegmentHandover(segmentId, supplierId) {
  try {
    const segment = await findShipmentSegmentById(segmentId);
    if (!segment) return;

    const shipment = await getShipmentById(segment.shipment_id);
    if (!shipment) return;

    const { query } = await import("../db.js");

    // Fetch all required data in parallel
    const [
      manufacturerResult,
      consumerResult,
      supplierResult,
      checkpointsResult,
    ] = await Promise.all([
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.consumer_uuid,
      ]),
      query(`SELECT payload FROM users WHERE id = $1`, [supplierId]),
      query(
        `SELECT 
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          end_cp.name AS end_name,
          end_cp.state AS end_state
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.id = $1`,
        [segmentId]
      ),
    ]);

    const stakeholderRecipients = [
      manufacturerResult.rows[0]?.id,
      consumerResult.rows[0]?.id,
    ].filter(Boolean);

    if (stakeholderRecipients.length === 0) return;

    // Get supplier name
    const supplierName =
      supplierResult.rows[0]?.payload?.identification?.legalName ||
      supplierResult.rows[0]?.payload?.identification?.companyName ||
      "Supplier";

    // Get checkpoint details
    const checkpointData = checkpointsResult.rows[0];
    const startLocation = checkpointData?.start_name
      ? `${checkpointData.start_name}${
          checkpointData.start_state ? ", " + checkpointData.start_state : ""
        }`
      : `Checkpoint ${segment.segment_order}`;
    const endLocation = checkpointData?.end_name
      ? `${checkpointData.end_name}${
          checkpointData.end_state ? ", " + checkpointData.end_state : ""
        }`
      : `Checkpoint ${segment.segment_order + 1}`;

    // Notify stakeholders (manufacturer and consumer)
    await notificationService.createBulkNotifications(stakeholderRecipients, {
      type: notificationService.NotificationType.SEGMENT_HANDOVER,
      severity: notificationService.NotificationSeverity.INFO,
      title: "Segment Handed Over",
      message: `Shipment Segment #${segmentId} has been handed over to the next supplier`,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
        supplier_id: supplierId,
        supplier_name: supplierName,
        start_checkpoint: startLocation,
        end_checkpoint: endLocation,
        expected_ship_date: segment.expected_ship_date,
        estimated_arrival_date: segment.estimated_arrival_date,
      },
    });
  } catch (error) {
    console.error("Failed to send segment handover notification:", error);
  }
}

/**
 * Notifies when a segment is delivered
 */
export async function notifySegmentDelivered(segmentId, supplierId) {
  try {
    const segment = await findShipmentSegmentById(segmentId);
    if (!segment) return;

    const shipment = await getShipmentById(segment.shipment_id);
    if (!shipment) return;

    const { query } = await import("../db.js");

    // Fetch all required data in parallel
    const [
      manufacturerResult,
      consumerResult,
      supplierResult,
      checkpointsResult,
    ] = await Promise.all([
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE id = $1`, [
        shipment.consumer_uuid,
      ]),
      supplierId
        ? query(`SELECT payload FROM users WHERE id = $1`, [supplierId])
        : Promise.resolve({ rows: [] }),
      query(
        `SELECT 
          start_cp.name AS start_name,
          start_cp.state AS start_state,
          end_cp.name AS end_name,
          end_cp.state AS end_state
         FROM shipment_segment ss
         LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
         LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
         WHERE ss.id = $1`,
        [segmentId]
      ),
    ]);

    const stakeholderRecipients = [
      manufacturerResult.rows[0]?.id,
      consumerResult.rows[0]?.id,
    ].filter(Boolean);

    if (stakeholderRecipients.length === 0) return;

    // No notification needed - already notified via "Segment Handed Over"
    // Segment Delivered is the same as Segment Handed Over to next supplier
  } catch (error) {
    console.error("Failed to send segment delivered notification:", error);
  }
}

// ============================================================================
// CONDITION BREACH NOTIFICATIONS
// ============================================================================
// ============================================================================
// CONDITION BREACH NOTIFICATIONS
// ============================================================================

/**
 * Notifies when a condition breach is detected (Temperature, Container Open, etc)
 *
 * Recipients:
 * 1. Manufacturer (from condition_breaches → package_registry → manufacturer_uuid)
 * 2. Current Supplier IF IN_TRANSIT (from shipment_segment WHERE status='IN_TRANSIT')
 *    - If no IN_TRANSIT segment: only Manufacturer is notified
 *
 * @param {string} breachId - Breach ID
 * @param {object} breachData - Optional breach data (to avoid transaction issues)
 */
export async function notifyConditionBreach(breachId, breachData = null) {
  try {
    console.log(
      `\n📢 ===== notifyConditionBreach START ===== for breach ${breachId}`
    );

    const { query } = await import("../db.js");

    // Step 1: Get breach details
    let breach;
    if (breachData) {
      // Use provided data (avoids transaction/timing issues)
      console.log(`✅ Using provided breach data (no DB query needed)`);
      breach = breachData;
    } else {
      // Query from database (for direct calls)
      console.log(`🔍 Step 1: Fetching breach record from database...`);
      const breachResult = await query(
        `SELECT * FROM condition_breaches WHERE id = $1`,
        [breachId]
      );

      if (!breachResult.rows.length) {
        console.log(`❌ Breach not found in database: ${breachId}`);
        return;
      }

      breach = breachResult.rows[0];
    }

    console.log(`✅ Breach available:`, {
      id: breach.id,
      package_id: breach.package_id,
      shipment_id: breach.shipment_id,
      breach_type: breach.breach_type,
      severity: breach.severity,
    });

    // Step 2: Get package, manufacturer, and shipment details
    console.log(`🔍 Step 2: Fetching package, manufacturer, and shipment...`);
    const packageResult = await query(
      `SELECT id, manufacturer_uuid, shipment_id FROM package_registry WHERE id = $1`,
      [breach.package_id]
    );

    if (!packageResult.rows.length) {
      console.log(`❌ Package not found: ${breach.package_id}`);
      return;
    }

    const pkg = packageResult.rows[0];
    console.log(`✅ Package found:`, {
      id: pkg.id,
      manufacturer_uuid: pkg.manufacturer_uuid,
      shipment_id: pkg.shipment_id,
    });

    // Step 3: Get manufacturer user details
    console.log(
      `🔍 Step 3: Looking up manufacturer user: ${pkg.manufacturer_uuid}`
    );
    const manufacturerData = await getUserByIdentifier(
      query,
      pkg.manufacturer_uuid
    );

    if (!manufacturerData) {
      console.log(`❌ Manufacturer user not found: ${pkg.manufacturer_uuid}`);
      return;
    }

    const recipients = [manufacturerData.id];
    console.log(`✅ Manufacturer user found:`, manufacturerData.id);

    // Step 4: Get current supplier (if shipment in transit)
    let currentSupplier = null;
    const shipmentId = pkg.shipment_id || breach.shipment_id; // Try package first, then breach

    if (shipmentId) {
      console.log(
        `🔍 Step 4: Checking for IN_TRANSIT segment for shipment: ${shipmentId}`
      );

      const supplierResult = await query(
        `SELECT supplier_id FROM shipment_segment WHERE shipment_id = $1 AND status = 'IN_TRANSIT' LIMIT 1`,
        [shipmentId]
      );

      console.log(`   Found ${supplierResult.rows.length} IN_TRANSIT segments`);

      if (supplierResult.rows.length > 0) {
        const supplierId = supplierResult.rows[0].supplier_id;
        console.log(`   Segment has supplier_id: ${supplierId}`);

        if (supplierId) {
          currentSupplier = await getUserByIdentifier(query, supplierId);
          if (currentSupplier) {
            recipients.push(currentSupplier.id);
            console.log(`✅ Current supplier user found:`, currentSupplier.id);
          } else {
            console.log(`❌ Supplier user not found for id: ${supplierId}`);
          }
        }
      } else {
        console.log(`ℹ️  No IN_TRANSIT segment - only notifying manufacturer`);
      }
    } else {
      console.log(`ℹ️  No shipment_id available - only notifying manufacturer`);
    }

    if (recipients.length === 0) {
      console.log(`❌ No valid recipients found for breach ${breachId}`);
      return;
    }

    console.log(
      `📨 Step 5: Creating notifications for ${recipients.length} recipients:`,
      recipients
    );

    // Step 6: Create appropriate notification based on breach type
    let title = "⚠️ Condition Breach Detected";
    let message = `Condition breach detected on package`;
    let severity = notificationService.NotificationSeverity.WARNING;

    if (breach.breach_type === "TEMPERATURE_EXCURSION") {
      title = "🌡️ Temperature Excursion";
      message = `Temperature exceeded limits: ${parseFloat(
        breach.measured_avg_value
      ).toFixed(2)}°C `;
      severity = notificationService.NotificationSeverity.WARNING;
    } else if (breach.breach_type === "CONTAINER_OPENED") {
      title = "🔓 Container Opened";
      message = `Package container was opened during transit`;
      severity = notificationService.NotificationSeverity.CRITICAL;
    } else if (breach.breach_type === "DOOR_TAMPER") {
      title = "🔒 Unauthorized Container Opening Detected";
      message = `Unauthorized door opening detected`;
      severity = notificationService.NotificationSeverity.CRITICAL;
    } else {
      message = `${breach.breach_type} breach detected on package`;
      severity =
        breach.severity === "CRITICAL"
          ? notificationService.NotificationSeverity.CRITICAL
          : breach.severity === "HIGH"
          ? notificationService.NotificationSeverity.ERROR
          : notificationService.NotificationSeverity.WARNING;
    }

    // Step 7: Send notification (exclude breachId to avoid FK constraint issues during transaction)
    console.log(`📝 Building notification payload...`);

    // Build metadata conditionally based on breach type
    const baseMetadata = {
      breach_type: breach.breach_type,
      breach_id: breachId,
      severity: breach.severity,
      breach_time: breach.breach_start_time,
      shipment_id: breach.shipment_id,
      location_latitude: breach.location_latitude,
      location_longitude: breach.location_longitude,
      manufacturer_id: manufacturerData.id,
      supplier_id: currentSupplier?.id || null,
    };

    // Add temperature-specific fields only for temperature excursions
    if (breach.breach_type === "TEMPERATURE_EXCURSION") {
      const tempValue = parseFloat(breach.measured_avg_value).toFixed(2);
      const minTemp = parseFloat(breach.expected_min_value).toFixed(2);
      const maxTemp = parseFloat(breach.expected_max_value).toFixed(2);
      baseMetadata.measured_value = `${tempValue}°C`;
      baseMetadata.allowed_range = `${minTemp}°C - ${maxTemp}°C`;
    }

    const notificationPayload = {
      type: getNotificationType(breach.breach_type),
      severity,
      title,
      message: `Package #${breach.package_id}: ${message}`,
      packageId: breach.package_id,
      shipmentId: breach.shipment_id,
      breachId: null, // Set to null to avoid FK constraint during transaction
      metadata: baseMetadata,
    };

    console.log(`📨 Calling createBulkNotifications with:`, {
      recipientCount: recipients.length,
      recipients,
      type: notificationPayload.type,
      severity: notificationPayload.severity,
    });

    const result = await notificationService.createBulkNotifications(
      recipients,
      notificationPayload
    );

    console.log(`✅ createBulkNotifications returned:`, result);
    console.log(`✅ Breach notification sent for ${breachId}`);
    console.log(`📢 ===== notifyConditionBreach END ===== \n`);
  } catch (error) {
    console.error(
      `\n❌ ===== CRITICAL ERROR in notifyConditionBreach for breach ${breachId}: =====`
    );
    console.error(`   Error message: ${error.message}`);
    console.error(`   Error stack: ${error.stack}`);
    console.error(`   Full error:`, error);
    console.error(`❌ ===== ERROR END ===== \n`);
  }
}

/**
 * Helper function to map breach type to notification type
 */
function getNotificationType(breachType) {
  const breachTypeMap = {
    TEMPERATURE_EXCURSION:
      notificationService.NotificationType.TEMPERATURE_BREACH,
    CONTAINER_OPENED: notificationService.NotificationType.CONDITION_BREACH,
    DOOR_TAMPER: notificationService.NotificationType.CONDITION_BREACH,
  };

  return (
    breachTypeMap[breachType] ||
    notificationService.NotificationType.CONDITION_BREACH
  );
}
