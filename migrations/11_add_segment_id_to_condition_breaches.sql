-- Migration 11: Add segment_id to condition_breaches
--
-- Adds direct reference to shipment_segment for easier supplier alert queries
-- segment_id will be populated ONLY when shipment_segment.status = 'IN_TRANSIT'
--
-- This is added to the initial schema so fresh databases have this column

ALTER TABLE condition_breaches
ADD COLUMN segment_id UUID REFERENCES shipment_segment (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_breaches_segment ON condition_breaches (segment_id);

CREATE INDEX IF NOT EXISTS idx_breaches_segment_supplier ON condition_breaches (segment_id)
WHERE
    segment_id IS NOT NULL;

-- Add comment documenting the business logic
COMMENT ON COLUMN condition_breaches.segment_id IS 'Direct reference to shipment_segment. Only populated when segment status is IN_TRANSIT at time of breach. NULL for other statuses.';