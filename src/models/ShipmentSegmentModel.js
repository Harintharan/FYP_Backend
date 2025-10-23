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
  fromUserId,
  toUserId,
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
        from_user_id,
        to_user_id,
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
      fromUserId ?? null,
      toUserId ?? null,
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

export async function listShipmentSegmentsByShipmentId(shipmentId, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT ss.*,
            sc1.name AS start_name,
            sc2.name AS end_name
       FROM shipment_segment ss
       JOIN checkpoint_registry sc1
         ON ss.start_checkpoint_id = sc1.id
       JOIN checkpoint_registry sc2
         ON ss.end_checkpoint_id = sc2.id
      WHERE ss.shipment_id = $1
      ORDER BY ss.created_at ASC`,
    [shipmentId]
  );
  return rows;
}

export async function updateShipmentSegmentRecord({
  segmentId,
  status,
  toUserId,
  segmentHash,
  txHash,
  pinataCid,
  pinataPinnedAt,
}, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE shipment_segment
        SET status = $2,
            to_user_id = COALESCE($3, to_user_id),
            segment_hash = $4,
            tx_hash = $5,
            pinata_cid = $6,
            pinata_pinned_at = $7,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      segmentId,
      status,
      toUserId ?? null,
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
