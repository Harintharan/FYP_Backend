import * as notificationService from "./notificationService.js";
import { getShipmentById } from "../models/ShipmentRegistryModel.js";
import { findShipmentSegmentById } from "../models/ShipmentSegmentModel.js";

/**
 * Notification Triggers
 * Centralized functions for triggering notifications based on business events
 */

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

    const [manufacturerResult, consumerResult, segmentCountResult] =
      await Promise.all([
        query(`SELECT id, status, payload FROM users WHERE public_key = $1`, [
          shipment.manufacturer_uuid,
        ]),
        query(`SELECT id, status, payload FROM users WHERE public_key = $1`, [
          shipment.consumer_uuid,
        ]),
        query(
          `SELECT COUNT(*) as segment_count FROM shipment_segment WHERE shipment_id = $1`,
          [shipmentId]
        ),
      ]);

    const manufacturerData = manufacturerResult.rows[0];
    const consumerData = consumerResult.rows[0];
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

    const [manufacturerResult, consumerResult, segmentsResult] =
      await Promise.all([
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.manufacturer_uuid,
        ]),
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.consumer_uuid,
        ]),
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

    const manufacturerData = manufacturerResult.rows[0];
    const consumerData = consumerResult.rows[0];
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

    const [manufacturerResult, consumerResult, segmentsResult] =
      await Promise.all([
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.manufacturer_uuid,
        ]),
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.consumer_uuid,
        ]),
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

    const manufacturerData = manufacturerResult.rows[0];
    const consumerData = consumerResult.rows[0];
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
 */
export async function notifyShipmentDelivered(shipmentId) {
  try {
    const shipment = await getShipmentById(shipmentId);
    if (!shipment) return;

    const { query } = await import("../db.js");

    const [manufacturerResult, consumerResult, segmentsResult] =
      await Promise.all([
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.manufacturer_uuid,
        ]),
        query(`SELECT id, payload FROM users WHERE public_key = $1`, [
          shipment.consumer_uuid,
        ]),
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

    const manufacturerData = manufacturerResult.rows[0];
    const consumerData = consumerResult.rows[0];
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
      type: notificationService.NotificationType.SHIPMENT_DELIVERED,
      severity: notificationService.NotificationSeverity.SUCCESS,
      title: "Shipment Delivered",
      message: `Shipment #${shipmentId} has been successfully delivered`,
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
    console.error("Failed to send shipment delivered notification:", error);
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
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
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

    const stakeholderRecipients = [
      manufacturerResult.rows[0]?.id,
      consumerResult.rows[0]?.id,
    ].filter(Boolean);

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

    // Notify shipment stakeholders (manufacturer & consumer)
    if (stakeholderRecipients.length > 0) {
      await notificationService.createBulkNotifications(stakeholderRecipients, {
        type: notificationService.NotificationType.SEGMENT_ACCEPTED,
        severity: notificationService.NotificationSeverity.SUCCESS,
        title: "Segment Accepted",
        message: `Segment #${segmentId} (${startLocation} → ${endLocation}) has been accepted by ${supplierName}`,
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

    // Notify the supplier who accepted (confirmation)
    await notificationService.createBulkNotifications([supplierId], {
      type: notificationService.NotificationType.SEGMENT_ACCEPTED,
      severity: notificationService.NotificationSeverity.SUCCESS,
      title: "Segment Acceptance Confirmed",
      message: `Segment #${segmentId} accepted: ${startLocation} → ${endLocation}`,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
        start_checkpoint: startLocation,
        end_checkpoint: endLocation,
        expected_ship_date: segment.expected_ship_date,
        estimated_arrival_date: segment.estimated_arrival_date,
      },
    });
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
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
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
      message: `Segment #${segmentId} (${startLocation} → ${endLocation}) has been picked up by ${supplierName}`,
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

    // Notify the supplier who picked up the segment
    await notificationService.createNotification({
      userId: supplierId,
      type: notificationService.NotificationType.SEGMENT_TAKEOVER,
      severity: notificationService.NotificationSeverity.INFO,
      title: "Segment Picked Up",
      message: `Segment #${segmentId} picked up: ${startLocation} → ${endLocation}`,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
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
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
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
      message: `Segment #${segmentId} (${startLocation} → ${endLocation}) has been handed over to ${supplierName}`,
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

    // Notify the supplier who received the handover
    await notificationService.createNotification({
      userId: supplierId,
      type: notificationService.NotificationType.SEGMENT_HANDOVER,
      severity: notificationService.NotificationSeverity.INFO,
      title: "Segment Handed Over",
      message: `Segment #${segmentId} handed over: ${startLocation} → ${endLocation}`,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
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
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
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

    // Get supplier name if available
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
    const stakeholderMessage = supplierId
      ? `Segment #${segmentId} (${startLocation} → ${endLocation}) has been delivered by ${supplierName}`
      : `Segment #${segmentId} (${startLocation} → ${endLocation}) has been delivered`;

    await notificationService.createBulkNotifications(stakeholderRecipients, {
      type: notificationService.NotificationType.SEGMENT_DELIVERED,
      severity: notificationService.NotificationSeverity.SUCCESS,
      title: "Segment Delivered",
      message: stakeholderMessage,
      segmentId,
      shipmentId: segment.shipment_id,
      metadata: {
        ...(supplierId && {
          supplier_id: supplierId,
          supplier_name: supplierName,
        }),
        start_checkpoint: startLocation,
        end_checkpoint: endLocation,
        expected_ship_date: segment.expected_ship_date,
        estimated_arrival_date: segment.estimated_arrival_date,
      },
    });

    // Notify the supplier who delivered (if supplierId provided)
    if (supplierId) {
      await notificationService.createNotification({
        userId: supplierId,
        type: notificationService.NotificationType.SEGMENT_DELIVERED,
        severity: notificationService.NotificationSeverity.SUCCESS,
        title: "Segment Delivered",
        message: `Segment #${segmentId} delivered: ${startLocation} → ${endLocation}`,
        segmentId,
        shipmentId: segment.shipment_id,
        metadata: {
          start_checkpoint: startLocation,
          end_checkpoint: endLocation,
          expected_ship_date: segment.expected_ship_date,
          estimated_arrival_date: segment.estimated_arrival_date,
        },
      });
    }
  } catch (error) {
    console.error("Failed to send segment delivered notification:", error);
  }
}

// ============================================================================
// CONDITION BREACH NOTIFICATIONS
// ============================================================================

/**
 * Notifies when a condition breach is detected
 */
export async function notifyConditionBreach(breachData) {
  try {
    const {
      breach_id,
      shipment_id,
      segment_id,
      package_id,
      breach_type,
      severity,
      description,
    } = breachData;

    const shipment = await getShipmentById(shipment_id);
    if (!shipment) return;

    const { query } = await import("../db.js");

    // Fetch manufacturer, consumer, and segment details in parallel
    const queries = [
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.manufacturer_uuid,
      ]),
      query(`SELECT id, payload FROM users WHERE public_key = $1`, [
        shipment.consumer_uuid,
      ]),
    ];

    // Add segment and checkpoint query if segment_id exists
    if (segment_id) {
      queries.push(
        query(
          `SELECT 
            ss.supplier_id,
            ss.expected_ship_date,
            ss.estimated_arrival_date,
            start_cp.name AS start_name,
            start_cp.state AS start_state,
            end_cp.name AS end_name,
            end_cp.state AS end_state,
            u.payload AS supplier_payload
           FROM shipment_segment ss
           LEFT JOIN checkpoint_registry start_cp ON start_cp.id = ss.start_checkpoint_id
           LEFT JOIN checkpoint_registry end_cp ON end_cp.id = ss.end_checkpoint_id
           LEFT JOIN users u ON u.id = ss.supplier_id
           WHERE ss.id = $1`,
          [segment_id]
        )
      );
    }

    const results = await Promise.all(queries);
    const manufacturerResult = results[0];
    const consumerResult = results[1];
    const segmentResult = segment_id ? results[2] : null;

    const recipients = [
      manufacturerResult.rows[0]?.id,
      consumerResult.rows[0]?.id,
    ].filter(Boolean);

    let supplierName = null;
    let startLocation = null;
    let endLocation = null;
    let segmentMetadata = {};

    // Add supplier and checkpoint details if segment exists
    if (segmentResult?.rows[0]) {
      const segmentData = segmentResult.rows[0];
      if (segmentData.supplier_id) {
        recipients.push(segmentData.supplier_id);
        supplierName =
          segmentData.supplier_payload?.identification?.legalName ||
          segmentData.supplier_payload?.identification?.companyName ||
          "Supplier";
      }

      startLocation = segmentData.start_name
        ? `${segmentData.start_name}${
            segmentData.start_state ? ", " + segmentData.start_state : ""
          }`
        : null;
      endLocation = segmentData.end_name
        ? `${segmentData.end_name}${
            segmentData.end_state ? ", " + segmentData.end_state : ""
          }`
        : null;

      segmentMetadata = {
        ...(startLocation && { start_checkpoint: startLocation }),
        ...(endLocation && { end_checkpoint: endLocation }),
        ...(segmentData.expected_ship_date && {
          expected_ship_date: segmentData.expected_ship_date,
        }),
        ...(segmentData.estimated_arrival_date && {
          estimated_arrival_date: segmentData.estimated_arrival_date,
        }),
        ...(supplierName && { supplier_name: supplierName }),
      };
    }

    if (recipients.length === 0) return;

    const notificationSeverity =
      severity === "CRITICAL"
        ? notificationService.NotificationSeverity.CRITICAL
        : severity === "HIGH"
        ? notificationService.NotificationSeverity.ERROR
        : notificationService.NotificationSeverity.WARNING;

    // Build enhanced message with location details
    let enhancedMessage =
      description || `A ${breach_type.toLowerCase()} breach has been detected`;
    if (startLocation && endLocation) {
      enhancedMessage += ` on route ${startLocation} → ${endLocation}`;
    }
    if (segment_id) {
      enhancedMessage = `Segment #${segment_id}: ${enhancedMessage}`;
    }

    await notificationService.createBulkNotifications(recipients, {
      type:
        breach_type === "TEMPERATURE"
          ? notificationService.NotificationType.TEMPERATURE_BREACH
          : breach_type === "TIME"
          ? notificationService.NotificationType.TIME_BREACH
          : notificationService.NotificationType.CONDITION_BREACH,
      severity: notificationSeverity,
      title: `${breach_type} Breach Detected`,
      message: enhancedMessage,
      shipmentId: shipment_id,
      segmentId: segment_id,
      packageId: package_id,
      breachId: breach_id,
      metadata: {
        breach_type,
        severity,
        ...segmentMetadata,
      },
      expiresInDays: 30,
    });
  } catch (error) {
    console.error("Failed to send condition breach notification:", error);
  }
}

/**
 * Notifies when a temperature breach occurs
 */
export async function notifyTemperatureBreach(telemetryData, packageData) {
  try {
    const { shipment_id, segment_id, package_id, temperature } = telemetryData;
    const { min_temp, max_temp } = packageData;

    await notifyConditionBreach({
      breach_id: null, // Will be set if stored in DB
      shipment_id,
      segment_id,
      package_id,
      breach_type: "TEMPERATURE",
      severity: "HIGH",
      description: `Temperature ${temperature}°C exceeds acceptable range (${min_temp}°C - ${max_temp}°C)`,
    });
  } catch (error) {
    console.error("Failed to send temperature breach notification:", error);
  }
}
