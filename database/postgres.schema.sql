-- Run this in PostgreSQL for production deployment.
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  booking_code TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bet_selections (
  id SERIAL PRIMARY KEY,
  bet_id INTEGER REFERENCES bets(id) ON DELETE CASCADE,
  match_id TEXT,
  home_team TEXT,
  away_team TEXT,
  market_type TEXT,
  selection TEXT,
  odds NUMERIC,
  start_time TIMESTAMPTZ,
  source_platform TEXT
);

CREATE TABLE IF NOT EXISTS event_logs (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  bet_id INTEGER REFERENCES bets(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
