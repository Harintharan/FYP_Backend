BEGIN;

CREATE OR REPLACE FUNCTION notify_pinata_job()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('pinata_jobs', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pinata_jobs_notify ON pinata_jobs;

CREATE TRIGGER pinata_jobs_notify
AFTER INSERT ON pinata_jobs
FOR EACH ROW
WHEN (NEW.status = 'PENDING')
EXECUTE FUNCTION notify_pinata_job();

INSERT INTO
    migrations (name)
VALUES ('13_add_pinata_jobs_notify')
ON CONFLICT (name) DO NOTHING;

COMMIT;
