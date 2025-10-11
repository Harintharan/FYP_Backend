ALTER TABLE product_registry
  DROP COLUMN IF EXISTS sensor_device_uuid,
  DROP COLUMN IF EXISTS qr_id;
