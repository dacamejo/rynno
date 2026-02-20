CREATE TABLE IF NOT EXISTS feedback_events (
  feedback_event_id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  trip_id TEXT REFERENCES trips(trip_id) ON DELETE SET NULL,
  reminder_id BIGINT REFERENCES reminders(reminder_id) ON DELETE SET NULL,
  playlist_id TEXT,
  rating SMALLINT,
  feedback_text TEXT,
  outcome TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_occurred_at
  ON feedback_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_events_type_occurred
  ON feedback_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_events_trip
  ON feedback_events (trip_id, occurred_at DESC);
