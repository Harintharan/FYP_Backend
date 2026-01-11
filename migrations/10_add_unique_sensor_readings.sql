-- Deduplicate sensor_readings by (package_id, sensor_type, sensor_timestamp_unix)
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY package_id, sensor_type, sensor_timestamp_unix
      ORDER BY created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY package_id, sensor_type, sensor_timestamp_unix
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM sensor_readings
),
duplicates AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE condition_breaches cb
SET sensor_reading_id = duplicates.keep_id
FROM duplicates
WHERE cb.sensor_reading_id = duplicates.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY package_id, sensor_type, sensor_timestamp_unix
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM sensor_readings
)
DELETE FROM sensor_readings sr
USING ranked r
WHERE sr.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_unique
  ON sensor_readings (package_id, sensor_type, sensor_timestamp_unix);
