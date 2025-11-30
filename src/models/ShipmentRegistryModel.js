import { query } from "../db.js";

function resolveExecutor(dbClient) {
  if (dbClient && typeof dbClient.query === "function") {
    return (text, params) => dbClient.query(text, params);
  }
  return query;
}

export async function createShipment(data, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO shipment_registry
       (id, manufacturer_uuid, consumer_uuid, status,
        shipment_hash, tx_hash, created_by, pinata_cid, pinata_pinned_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING *`,
    [
      data.id,
      data.manufacturerUUID,
      data.consumerUUID,
      data.status ?? "PENDING",
      data.shipment_hash,
      data.tx_hash,
      data.created_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateShipment(id, data, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE shipment_registry SET
         manufacturer_uuid=$1,
         consumer_uuid=$2,
         status=$3,
         shipment_hash=$4,
         tx_hash=$5,
         updated_by=$6,
         pinata_cid=$7,
         pinata_pinned_at=$8,
         updated_at=NOW()
       WHERE id=$9 RETURNING *`,
    [
      data.manufacturerUUID,
      data.consumerUUID,
      data.status ?? null,
      data.shipment_hash,
      data.tx_hash,
      data.updated_by,
      data.pinata_cid ?? null,
      data.pinata_pinned_at ?? null,
      id,
    ]
  );
  return rows[0];
}

export async function getShipmentById(id, dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT sr.*,
            -- Manufacturer details
            m.payload -> 'identification' ->> 'legalName' AS manufacturer_legal_name,
            m.payload -> 'identification' ->> 'companyName' AS manufacturer_company_name,
            -- Consumer/Destination details
            c.payload -> 'identification' ->> 'legalName' AS consumer_legal_name,
            c.payload -> 'identification' ->> 'companyName' AS consumer_company_name,
            -- Segments with supplier details
            (
              SELECT json_agg(
                json_build_object(
                  'id', ss.id,
                  'segmentOrder', ss.segment_order,
                  'status', ss.status,
                  'expectedShipDate', ss.expected_ship_date,
                  'estimatedArrivalDate', ss.estimated_arrival_date,
                  'timeTolerance', ss.time_tolerance,
                  'createdAt', ss.created_at,
                  'updatedAt', ss.updated_at,
                  'startCheckpoint', json_build_object(
                    'id', sc.id,
                    'name', sc.name,
                    'address', sc.address,
                    'state', sc.state,
                    'country', sc.country
                  ),
                  'endCheckpoint', json_build_object(
                    'id', ec.id,
                    'name', ec.name,
                    'address', ec.address,
                    'state', ec.state,
                    'country', ec.country
                  ),
                  'supplier', CASE 
                    WHEN ss.supplier_id IS NOT NULL THEN json_build_object(
                      'id', sup.id,
                      'legalName', sup.payload -> 'identification' ->> 'legalName',
                      'companyName', sup.payload -> 'identification' ->> 'companyName',
                      'email', sup.payload -> 'contact' ->> 'email',
                      'phone', sup.payload -> 'contact' ->> 'phone',
                      'type', sup.reg_type
                    )
                    ELSE NULL
                  END
                ) ORDER BY ss.segment_order ASC
              )
              FROM shipment_segment ss
              LEFT JOIN checkpoint_registry sc ON ss.start_checkpoint_id = sc.id
              LEFT JOIN checkpoint_registry ec ON ss.end_checkpoint_id = ec.id
              LEFT JOIN users sup ON ss.supplier_id = sup.id
              WHERE ss.shipment_id = sr.id
            ) AS segments,
            -- Packages with product details
            (
              SELECT json_agg(
                json_build_object(
                  'packageId', pr.id,
                  'quantity', pr.quantity,
                  'status', pr.status,
                  'productName', p.name,
                  'productCategory', pc.name,
                  'batchId', b.id,
                  'expiryDate', b.expiry_date,
                  'productionStartTime', b.production_start_time,
                  'productionEndTime', b.production_end_time,
                  'requiredTempStart', p.required_start_temp,
                  'requiredTempEnd', p.required_end_temp
                )
              )
              FROM package_registry pr
              LEFT JOIN batches b ON pr.batch_id = b.id
              LEFT JOIN products p ON b.product_id = p.id
              LEFT JOIN product_categories pc ON p.product_category_id = pc.id
              WHERE pr.shipment_id = sr.id
            ) AS packages
     FROM shipment_registry sr
     LEFT JOIN users m ON m.id::text = sr.manufacturer_uuid::text
     LEFT JOIN users c ON c.id::text = sr.consumer_uuid::text
     WHERE sr.id = $1`,
    [id]
  );
  return rows[0];
}

export async function getAllShipments(dbClient) {
  const exec = resolveExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM shipment_registry ORDER BY created_at DESC`
  );
  return rows;
}

export async function listShipmentsByManufacturerId(
  manufacturerId,
  { status, cursor, limit = 20 } = {},
  dbClient
) {
  const exec = resolveExecutor(dbClient);
  const hasStatus = typeof status === "string" && status.length > 0;
  const hasCursor = typeof cursor === "string" && cursor.length > 0;

  // Build parameter array dynamically
  const params = [manufacturerId];
  let paramIndex = 2;

  const statusClause = hasStatus ? `AND sr.status = $${paramIndex++}` : "";
  if (hasStatus) params.push(status);

  const cursorClause = hasCursor ? `AND sr.created_at < $${paramIndex++}` : "";
  if (hasCursor) params.push(cursor);

  params.push(limit + 1); // Fetch one extra to check if there's more
  const limitClause = `LIMIT $${paramIndex}`;

  const { rows } = await exec(
    `SELECT sr.*,
            u.payload -> 'identification' ->> 'legalName' AS consumer_legal_name,
            u.payload -> 'identification' ->> 'companyName' AS consumer_company_name,
            (
              SELECT json_agg(
                json_build_object(
                  'id', ss.id,
                  'segmentOrder', ss.segment_order,
                  'status', ss.status,
                  'expectedShipDate', ss.expected_ship_date,
                  'estimatedArrivalDate', ss.estimated_arrival_date,
                  'timeTolerance', ss.time_tolerance,
                  'startCheckpoint', json_build_object(
                    'id', sc.id,
                    'name', sc.name,
                    'state', sc.state,
                    'country', sc.country
                  ),
                  'endCheckpoint', json_build_object(
                    'id', ec.id,
                    'name', ec.name,
                    'state', ec.state,
                    'country', ec.country
                  )
                ) ORDER BY ss.segment_order ASC
              )
              FROM shipment_segment ss
              LEFT JOIN checkpoint_registry sc ON ss.start_checkpoint_id = sc.id
              LEFT JOIN checkpoint_registry ec ON ss.end_checkpoint_id = ec.id
              WHERE ss.shipment_id = sr.id
            ) AS segments,
            (
              SELECT json_agg(
                json_build_object(
                  'packageId', pr.id,
                  'quantity', pr.quantity,
                  'productName', p.name,
                  'productCategory', pc.name,
                  'batchId', b.id,
                  'requiredTempStart', p.required_start_temp,
                  'requiredTempEnd', p.required_end_temp
                )
              )
              FROM package_registry pr
              LEFT JOIN batches b ON pr.batch_id = b.id
              LEFT JOIN products p ON b.product_id = p.id
              LEFT JOIN product_categories pc ON p.product_category_id = pc.id
              WHERE pr.shipment_id = sr.id
            ) AS shipment_items
       FROM shipment_registry sr
       LEFT JOIN users u
         ON u.id::text = sr.consumer_uuid::text
      WHERE sr.manufacturer_uuid = $1
        ${statusClause}
        ${cursorClause}
      ORDER BY sr.created_at DESC
      ${limitClause}`,
    params
  );
  return rows;
}
