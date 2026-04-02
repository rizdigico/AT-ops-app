-- Idempotent: ensure the composite unique constraint exists and the
-- old single-column constraint is gone, regardless of prior migration state.

ALTER TABLE flights DROP CONSTRAINT IF EXISTS flights_file_ref_key;
ALTER TABLE flights DROP CONSTRAINT IF EXISTS flights_file_ref_scheduled_time_key;

ALTER TABLE flights
  ADD CONSTRAINT flights_file_ref_scheduled_time_key
  UNIQUE (file_ref, scheduled_time);
