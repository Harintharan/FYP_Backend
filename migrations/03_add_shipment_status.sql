-- Add shipment_status enum type if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'shipment_status'
  ) THEN
    CREATE TYPE shipment_status AS ENUM (
      'PENDING',
      'ACCEPTED',
      'IN_TRANSIT',
      'DELIVERED',
      'CLOSED',
      'CANCELLED'
    );
  END IF;
END
$$;

-- Add status column to shipment_registry
ALTER TABLE shipment_registry
ADD COLUMN IF NOT EXISTS status shipment_status DEFAULT 'PENDING';

-- Set default status for existing rows
UPDATE shipment_registry
SET
    status = 'PENDING'
WHERE
    status IS NULL;

-- Make status column NOT NULL and set default
ALTER TABLE shipment_registry ALTER COLUMN status SET NOT NULL;

ALTER TABLE shipment_registry
ALTER COLUMN status
SET DEFAULT 'PENDING';