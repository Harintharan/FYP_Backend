-- Add PACKAGE_ACCEPTED value to package_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
     WHERE pg_type.typname = 'package_status'
       AND enumlabel = 'PACKAGE_ACCEPTED'
  ) THEN
    ALTER TYPE package_status ADD VALUE 'PACKAGE_ACCEPTED';
  END IF;
END
$$;