import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function insertShipmentSegment({
  id,
  shipmentId,
  startCheckpointId,
  endCheckpointId,
  expectedShipDate,
  estimatedArrivalDate,
  timeTolerance,
  supplierId,
  segmentOrder,
  status,
  segmentHash,
  txHash,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO shipment_segment (
        id,
        shipment_id,
        start_checkpoint_id,
        end_checkpoint_id,
        expected_ship_date,
        estimated_arrival_date,
        time_tolerance,
        supplier_id,
        segment_order,
        status,
        segment_hash,
        tx_hash,
        pinata_cid,
        pinata_pinned_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      RETURNING *`,
    [
      id,
      shipmentId,
      startCheckpointId,
      endCheckpointId,
      expectedShipDate,
      estimatedArrivalDate,
      timeTolerance ?? null,
      supplierId ?? null,
      segmentOrder,
      status ?? "PENDING",
      segmentHash,
      txHash ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null
    ]
  );
  return rows[0] ?? null;
}

export async function findShipmentSegmentById(segmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM shipment_segment
      WHERE id = $1
      LIMIT 1`,
    [segmentId]
  );
  return rows[0] ?? null;
}

export async function findShipmentSegmentDetailsById(segmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT
        ss.*,
        sr.consumer_uuid,
        sr.manufacturer_uuid,
        m.payload -> 'identification' ->> 'legalName' AS manufacturer_legal_name,
        sc_start.address AS start_address,
        sc_start.state AS start_state,
        sc_start.name AS start_name,
        sc_start.country AS start_country,
        sc_end.address AS end_address,
        sc_end.state AS end_state,
        sc_end.name AS end_name,
        sc_end.country AS end_country,
        u.payload -> 'identification' ->> 'legalName' AS consumer_legal_name
      FROM shipment_segment ss
      JOIN shipment_registry sr
        ON sr.id::text = ss.shipment_id::text
      LEFT JOIN users m
        ON m.id::text = sr.manufacturer_uuid::text
      LEFT JOIN checkpoint_registry sc_start
        ON sc_start.id::text = ss.start_checkpoint_id::text
      LEFT JOIN checkpoint_registry sc_end
        ON sc_end.id::text = ss.end_checkpoint_id::text
      LEFT JOIN users u
        ON u.id::text = sr.consumer_uuid::text
     WHERE ss.id = $1
     LIMIT 1`,
    [segmentId]
  );
  return rows[0] ?? null;
}

export async function findPreviousShipmentSegment({
  shipmentId,
  segmentOrder,
  dbClient,
}) {
  if (!shipmentId || !Number.isFinite(segmentOrder)) {
    return null;
  }

  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
       FROM shipment_segment
      WHERE shipment_id = $1
        AND segment_order < $2
      ORDER BY segment_order DESC
      LIMIT 1`,
    [shipmentId, segmentOrder]
  );

  return rows[0] ?? null;
}

export async function listShipmentSegmentsByShipmentId(shipmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT ss.*,
            sc1.name AS start_name,
            sc1.state AS start_state,
            sc1.country AS start_country,
            sc2.name AS end_name,
            sc2.state AS end_state,
            sc2.country AS end_country
       FROM shipment_segment ss
       JOIN checkpoint_registry sc1
         ON ss.start_checkpoint_id = sc1.id
       JOIN checkpoint_registry sc2
         ON ss.end_checkpoint_id = sc2.id
      WHERE ss.shipment_id = $1
      ORDER BY ss.segment_order ASC, ss.created_at ASC`,
    [shipmentId]
  );
  return rows;
}

export async function listShipmentSegmentsByStatusWithDetails(status) {
  const { rows } = await query(
    `SELECT
        ss.*,
        sr.manufacturer_uuid,
        u.payload -> 'identification' ->> 'legalName' AS manufacturer_legal_name,
        sc_start.name AS start_name,
        sc_start.state AS start_state,
        sc_start.country AS start_country,
        sc_end.name AS end_name,
        sc_end.state AS end_state,
        sc_end.country AS end_country
      FROM shipment_segment ss
      JOIN shipment_registry sr
        ON sr.id::text = ss.shipment_id::text
      LEFT JOIN users u
        ON u.id::text = sr.manufacturer_uuid::text
      LEFT JOIN checkpoint_registry sc_start
        ON sc_start.id::text = ss.start_checkpoint_id::text
      LEFT JOIN checkpoint_registry sc_end
        ON sc_end.id::text = ss.end_checkpoint_id::text
     WHERE ss.status = $1
     ORDER BY ss.segment_order ASC, ss.created_at ASC`,
    [status]
  );
  return rows;
}

export async function listShipmentSegmentsBySupplierAndStatus({
  supplierId,
  status,
  filterBySupplier = true,
  cursor = null,
  limit = 20,
}) {
  const params = [];
  const conditions = [];

  if (filterBySupplier) {
    params.push(supplierId);
    conditions.push(`ss.supplier_id = $${params.length}::uuid`);
  }

  if (status) {
    params.push(status);
    conditions.push(
      `ss.status = $${params.length}::shipment_segment_status`
    );
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`ss.created_at < $${params.length}::timestamptz`);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join("\n       AND ")}`
      : "";

  const { rows } = await query(
    `SELECT
        ss.*,
        prev_segment.status AS previous_segment_status,
        sc_start.name AS start_name,
        sc_start.state AS start_state,
        sc_start.country AS start_country,
        sc_end.name AS end_name,
        sc_end.state AS end_state,
        sc_end.country AS end_country,
        sr.consumer_uuid,
        u.payload -> 'identification' ->> 'legalName' AS consumer_legal_name
      FROM shipment_segment ss
      JOIN checkpoint_registry sc_start
        ON sc_start.id = ss.start_checkpoint_id
      JOIN checkpoint_registry sc_end
        ON sc_end.id = ss.end_checkpoint_id
      JOIN shipment_registry sr
        ON sr.id = ss.shipment_id
      LEFT JOIN LATERAL (
        SELECT status
          FROM shipment_segment prev
         WHERE prev.shipment_id = ss.shipment_id
           AND prev.segment_order < ss.segment_order
         ORDER BY prev.segment_order DESC
         LIMIT 1
      ) prev_segment ON true
      LEFT JOIN users u
        ON u.id::text = sr.consumer_uuid
     ${whereClause}
     ORDER BY ss.created_at DESC, ss.segment_order ASC
     LIMIT $${params.push(limit + 1)}`,
    params
  );

  return rows;
}

export async function updateShipmentSegmentRecord({
  segmentId,
  status,
  supplierId,
  segmentOrder,
  segmentHash,
  txHash,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE shipment_segment
        SET status = $2,
            supplier_id = COALESCE($3, supplier_id),
            segment_order = COALESCE($4, segment_order),
            segment_hash = $5,
            tx_hash = $6,
            pinata_cid = $7,
            pinata_pinned_at = $8,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      segmentId,
      status,
      supplierId ?? null,
      segmentOrder ?? null,
      segmentHash,
      txHash ?? null,
      pinataCid ?? null,
      pinataPinnedAt ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function deleteShipmentSegmentsByShipmentId(
  shipmentId,
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  await exec(
    `DELETE FROM shipment_segment
      WHERE shipment_id = $1`,
    [shipmentId]
  );
}
