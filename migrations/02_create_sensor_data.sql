BEGIN;

-- Legacy SQL to create sensor_data and sensor_data_breach removed.
-- The tables are deprecated and the telemetry system now records readings in `sensor_readings` and messages in `telemetry_messages`.

COMMIT;