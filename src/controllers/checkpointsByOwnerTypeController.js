import db from "../db.js";

/**
 * Get checkpoints filtered by owner type with optional search
 * Query params:
 *  - ownerType: MANUFACTURER, SUPPLIER, or CONSUMER (required)
 *  - name: search by checkpoint name (optional)
 */
export async function getCheckpointsByOwnerType(req, res) {
  const client = await db.connect();

  try {
    const { ownerType, name } = req.query;

    // Validate ownerType is provided
    if (!ownerType) {
      return res.status(400).json({
        error: "ownerType query parameter is required",
      });
    }

    // Validate ownerType value
    const validOwnerTypes = ["MANUFACTURER", "SUPPLIER", "CONSUMER"];
    if (!validOwnerTypes.includes(ownerType.toUpperCase())) {
      return res.status(400).json({
        error: `Invalid ownerType. Must be one of: ${validOwnerTypes.join(
          ", "
        )}`,
      });
    }

    // Build dynamic WHERE clause for search filters
    const conditions = ["u.reg_type = $1"];
    const params = [ownerType.toUpperCase()];
    let paramIndex = 2;

    if (name) {
      conditions.push(`c.name ILIKE $${paramIndex}`);
      params.push(`%${name}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Query checkpoints with owner information
    const query = `
      SELECT 
        c.id,
        c.name,
        c.address,
        c.state,
        c.country,
        c.owner_uuid,
        u.reg_type,
        u.status
      FROM checkpoint_registry c
      INNER JOIN users u ON c.owner_uuid = u.id
      WHERE ${whereClause}
      ORDER BY c.name ASC
    `;

    const result = await client.query(query, params);

    // Format response
    const checkpoints = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      state: row.state,
      country: row.country,
      owner_uuid: row.owner_uuid,
      owner_info: {
        reg_type: row.reg_type,
        status: row.status,
      },
    }));

    return res.json(checkpoints);
  } catch (error) {
    console.error("Error fetching checkpoints by owner type:", error);
    return res.status(500).json({
      error: "Failed to fetch checkpoints",
      details: error.message,
    });
  } finally {
    client.release();
  }
}
