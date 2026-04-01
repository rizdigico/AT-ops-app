-- Airport Transfer Dispatch: Flights Table
-- Run this in your Supabase SQL Editor to create the schema.

CREATE TABLE IF NOT EXISTS flights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_ref         TEXT        UNIQUE NOT NULL,
  date             DATE        NOT NULL,
  pax_name         TEXT        NOT NULL,
  pax_count        INTEGER     NOT NULL DEFAULT 1,
  flight_number    TEXT,
  agent            TEXT,
  terminal         TEXT,
  type             TEXT        NOT NULL CHECK (type IN ('Arrival', 'Departure')),
  scheduled_time   TIMESTAMPTZ NOT NULL,
  updated_time     TIMESTAMPTZ,
  driver_info      TEXT,
  notified         BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the cron job: quickly find flights within the next 4 hours that haven't been notified
CREATE INDEX IF NOT EXISTS idx_flights_scheduled
  ON flights (scheduled_time, notified, type);

-- Index for date-based dashboard queries
CREATE INDEX IF NOT EXISTS idx_flights_date
  ON flights (date);
