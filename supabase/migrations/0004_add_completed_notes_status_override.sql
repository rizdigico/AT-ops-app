-- Add completed, notes, status_override to flights
ALTER TABLE flights ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS status_override TEXT
  CHECK (status_override IN ('Delayed', 'Cancelled'));

-- Aviationstack API call tracking (500/month quota monitoring)
CREATE TABLE IF NOT EXISTS api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flight_number TEXT
);

-- Browser push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
