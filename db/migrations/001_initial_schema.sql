CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  spotify_user_id TEXT UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  source TEXT,
  canonical JSONB,
  raw_payload JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_legs (
  trip_leg_id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  leg_index INTEGER NOT NULL,
  mode TEXT,
  origin_name TEXT,
  destination_name TEXT,
  departure_at TIMESTAMPTZ,
  arrival_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, leg_index)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  oauth_token_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  scope TEXT,
  token_type TEXT,
  expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS spotify_playlists (
  spotify_playlist_id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  provider_playlist_id TEXT,
  provider_snapshot_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  playlist_url TEXT,
  quality_score NUMERIC(5,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  reminder_id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user_last_updated
  ON trips (user_id, last_updated DESC);

CREATE INDEX IF NOT EXISTS idx_trips_status
  ON trips (status);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip_id
  ON trip_legs (trip_id, leg_index);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider_expires
  ON oauth_tokens (provider, expires_at);

CREATE INDEX IF NOT EXISTS idx_spotify_playlists_trip_id
  ON spotify_playlists (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminders_schedule_queue
  ON reminders (status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_reminders_trip_id
  ON reminders (trip_id);
