-- Fix: file_ref alone is not unique — a booking can have multiple
-- transfer legs on different dates/times (arrival + departure + city tours).
-- Replace the single-column unique constraint with a composite one.

ALTER TABLE flights DROP CONSTRAINT IF EXISTS flights_file_ref_key;

ALTER TABLE flights
  ADD CONSTRAINT flights_file_ref_scheduled_time_key
  UNIQUE (file_ref, scheduled_time);
