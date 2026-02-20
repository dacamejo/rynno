const path = require('path');
const fs = require('fs/promises');
const { Pool } = require('pg');
const { encryptToken, decryptToken } = require('./tokenCrypto');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'trips.json');

let pool = null;
let fallbackStore = {};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadFallbackStore() {
  try {
    const text = await fs.readFile(FALLBACK_FILE, 'utf8');
    fallbackStore = JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') {
      fallbackStore = {};
    } else {
      console.error('Unable to read fallback trip store', error);
      fallbackStore = {};
    }
  }

  fallbackStore.trips = fallbackStore.trips || {};
  fallbackStore.users = fallbackStore.users || {};
  fallbackStore.oauthTokens = fallbackStore.oauthTokens || {};
  fallbackStore.reminders = fallbackStore.reminders || {};
}

async function persistFallbackStore() {
  await ensureDataDir();
  await fs.writeFile(FALLBACK_FILE, JSON.stringify(fallbackStore, null, 2));
}

async function ensureTablesExist() {
  const result = await pool.query(
    `SELECT
      to_regclass('public.trips') AS trips_table,
      to_regclass('public.users') AS users_table,
      to_regclass('public.oauth_tokens') AS oauth_tokens_table,
      to_regclass('public.reminders') AS reminders_table;`
  );
  if (!result.rows[0]?.trips_table) {
    throw new Error('Missing `trips` table. Run `npm run db:migrate` before starting the server.');
  }
  if (!result.rows[0]?.users_table || !result.rows[0]?.oauth_tokens_table || !result.rows[0]?.reminders_table) {
    throw new Error('Missing auth-related tables. Run `npm run db:migrate` before starting the server.');
  }
}

function getTripWindow(entry = {}) {
  const startsAt = entry.canonical?.firstDeparture || entry.metadata?.firstDeparture || null;
  const endsAt = entry.canonical?.finalArrival || entry.metadata?.finalArrival || null;
  return { startsAt, endsAt };
}

async function initDb() {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await ensureTablesExist();
  } else {
    await ensureDataDir();
    await loadFallbackStore();
  }
}

function transformRow(row) {
  if (!row) return null;
  return {
    status: row.status,
    canonical: row.canonical,
    rawPayload: row.raw_payload,
    source: row.source,
    metadata: row.metadata || {},
    lastUpdated: row.last_updated,
    errors: row.errors || []
  };
}

async function saveTripEntry(tripId, entry) {
  const { startsAt, endsAt } = getTripWindow(entry);
  if (pool) {
    await pool.query(
      `INSERT INTO trips (trip_id, user_id, status, canonical, raw_payload, source, metadata, starts_at, ends_at, last_updated, errors, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (trip_id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, trips.user_id),
         status = EXCLUDED.status,
         canonical = EXCLUDED.canonical,
         raw_payload = EXCLUDED.raw_payload,
         source = EXCLUDED.source,
         metadata = EXCLUDED.metadata,
         starts_at = COALESCE(EXCLUDED.starts_at, trips.starts_at),
         ends_at = COALESCE(EXCLUDED.ends_at, trips.ends_at),
         last_updated = EXCLUDED.last_updated,
         errors = EXCLUDED.errors,
         updated_at = NOW();`,
      [
        tripId,
        entry.metadata?.userId || null,
        entry.status,
        entry.canonical,
        entry.rawPayload,
        entry.source,
        entry.metadata,
        startsAt,
        endsAt,
        entry.lastUpdated,
        entry.errors
      ]
    );
    return;
  }

  fallbackStore.trips[tripId] = entry;
  await persistFallbackStore();
}

async function getTripEntry(tripId) {
  if (pool) {
    const result = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [tripId]);
    if (result.rowCount === 0) {
      return null;
    }
    return transformRow(result.rows[0]);
  }

  return fallbackStore.trips[tripId] || null;
}

async function createReminder({ tripId, userId = null, channel = 'in_app', scheduledFor, metadata = {} }) {
  if (pool) {
    const result = await pool.query(
      `INSERT INTO reminders (trip_id, user_id, channel, status, scheduled_for, metadata, updated_at)
       VALUES ($1,$2,$3,'scheduled',$4,$5,NOW())
       RETURNING reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at;`,
      [tripId, userId, channel, scheduledFor, metadata]
    );
    return result.rows[0];
  }

  const reminderId = String(Date.now() + Math.floor(Math.random() * 1000));
  const reminder = {
    reminder_id: reminderId,
    trip_id: tripId,
    user_id: userId,
    channel,
    status: 'scheduled',
    scheduled_for: scheduledFor,
    sent_at: null,
    failure_reason: null,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  fallbackStore.reminders[reminderId] = reminder;
  await persistFallbackStore();
  return reminder;
}

async function getReminder(reminderId) {
  if (pool) {
    const result = await pool.query(
      `SELECT reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at
       FROM reminders
       WHERE reminder_id = $1`,
      [reminderId]
    );
    return result.rows[0] || null;
  }

  return fallbackStore.reminders[reminderId] || null;
}

async function listDueReminders(referenceIso, limit = 25) {
  if (pool) {
    const result = await pool.query(
      `SELECT reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at
       FROM reminders
       WHERE status = 'scheduled'
         AND scheduled_for <= $1::timestamptz
       ORDER BY scheduled_for ASC
       LIMIT $2`,
      [referenceIso, limit]
    );
    return result.rows;
  }

  return Object.values(fallbackStore.reminders)
    .filter((item) => item.status === 'scheduled' && new Date(item.scheduled_for) <= new Date(referenceIso))
    .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))
    .slice(0, limit);
}

async function markReminderStatus(reminderId, { status, sentAt = null, failureReason = null, metadataPatch = null }) {
  if (pool) {
    const result = await pool.query(
      `UPDATE reminders
       SET status = $2,
           sent_at = $3,
           failure_reason = $4,
           metadata = CASE WHEN $5::jsonb IS NULL THEN metadata ELSE metadata || $5::jsonb END,
           updated_at = NOW()
       WHERE reminder_id = $1
       RETURNING reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at;`,
      [reminderId, status, sentAt, failureReason, metadataPatch ? JSON.stringify(metadataPatch) : null]
    );
    return result.rows[0] || null;
  }

  const existing = fallbackStore.reminders[reminderId];
  if (!existing) {
    return null;
  }

  existing.status = status;
  existing.sent_at = sentAt;
  existing.failure_reason = failureReason;
  if (metadataPatch && typeof metadataPatch === 'object') {
    existing.metadata = { ...(existing.metadata || {}), ...metadataPatch };
  }
  existing.updated_at = new Date().toISOString();
  await persistFallbackStore();
  return existing;
}

async function listTripsForRefresh(referenceIso, horizonMinutes = 120, limit = 20) {
  const upperBound = new Date(new Date(referenceIso).getTime() + horizonMinutes * 60 * 1000).toISOString();
  if (pool) {
    const result = await pool.query(
      `SELECT trip_id, status, canonical, raw_payload, source, metadata, last_updated, errors
       FROM trips
       WHERE status = 'complete'
         AND starts_at IS NOT NULL
         AND starts_at >= $1::timestamptz
         AND starts_at <= $2::timestamptz
       ORDER BY starts_at ASC
       LIMIT $3`,
      [referenceIso, upperBound, limit]
    );
    return result.rows.map(transformRow).map((row, index) => ({ tripId: result.rows[index].trip_id, entry: row }));
  }

  return Object.entries(fallbackStore.trips)
    .map(([tripId, entry]) => ({ tripId, entry }))
    .filter(({ entry }) => {
      if (entry.status !== 'complete') return false;
      const startsAt = entry.canonical?.firstDeparture || null;
      if (!startsAt) return false;
      return new Date(startsAt) >= new Date(referenceIso) && new Date(startsAt) <= new Date(upperBound);
    })
    .sort((a, b) => new Date(a.entry.canonical.firstDeparture) - new Date(b.entry.canonical.firstDeparture))
    .slice(0, limit);
}

async function upsertUser({ userId, email = null, spotifyUserId = null, locale = null, timezone = 'UTC' }) {
  if (pool) {
    const result = await pool.query(
      `INSERT INTO users (user_id, email, spotify_user_id, locale, timezone, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         spotify_user_id = COALESCE(EXCLUDED.spotify_user_id, users.spotify_user_id),
         locale = COALESCE(EXCLUDED.locale, users.locale),
         timezone = COALESCE(EXCLUDED.timezone, users.timezone),
         updated_at = NOW()
       RETURNING user_id, email, spotify_user_id, locale, timezone;`,
      [userId, email, spotifyUserId, locale, timezone]
    );
    return result.rows[0];
  }

  fallbackStore.users[userId] = {
    user_id: userId,
    email,
    spotify_user_id: spotifyUserId,
    locale,
    timezone,
    updated_at: new Date().toISOString()
  };
  await persistFallbackStore();
  return fallbackStore.users[userId];
}

async function saveOAuthToken({ userId, provider, accessToken, refreshToken, scope, tokenType, expiresAt, metadata = {} }) {
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  if (pool) {
    await pool.query(
      `INSERT INTO oauth_tokens
      (user_id, provider, access_token_ciphertext, refresh_token_ciphertext, scope, token_type, expires_at, last_refreshed_at, metadata, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,NOW())
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, oauth_tokens.refresh_token_ciphertext),
        scope = EXCLUDED.scope,
        token_type = EXCLUDED.token_type,
        expires_at = EXCLUDED.expires_at,
        last_refreshed_at = NOW(),
        metadata = EXCLUDED.metadata,
        updated_at = NOW();`,
      [userId, provider, encryptedAccessToken, encryptedRefreshToken, scope, tokenType, expiresAt, metadata]
    );
    return;
  }

  fallbackStore.oauthTokens[`${provider}:${userId}`] = {
    userId,
    provider,
    accessTokenCiphertext: encryptedAccessToken,
    refreshTokenCiphertext: encryptedRefreshToken,
    scope,
    tokenType,
    expiresAt,
    metadata,
    lastRefreshedAt: new Date().toISOString()
  };
  await persistFallbackStore();
}

async function getOAuthToken(userId, provider) {
  if (pool) {
    const result = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [userId, provider]);
    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      provider: row.provider,
      accessToken: decryptToken(row.access_token_ciphertext),
      refreshToken: row.refresh_token_ciphertext ? decryptToken(row.refresh_token_ciphertext) : null,
      scope: row.scope,
      tokenType: row.token_type,
      expiresAt: row.expires_at,
      lastRefreshedAt: row.last_refreshed_at,
      metadata: row.metadata || {}
    };
  }

  const entry = fallbackStore.oauthTokens[`${provider}:${userId}`];
  if (!entry) {
    return null;
  }

  return {
    userId: entry.userId,
    provider: entry.provider,
    accessToken: decryptToken(entry.accessTokenCiphertext),
    refreshToken: entry.refreshTokenCiphertext ? decryptToken(entry.refreshTokenCiphertext) : null,
    scope: entry.scope,
    tokenType: entry.tokenType,
    expiresAt: entry.expiresAt,
    lastRefreshedAt: entry.lastRefreshedAt,
    metadata: entry.metadata || {}
  };
}

module.exports = {
  initDb,
  saveTripEntry,
  getTripEntry,
  upsertUser,
  saveOAuthToken,
  getOAuthToken,
  createReminder,
  getReminder,
  listDueReminders,
  markReminderStatus,
  listTripsForRefresh
};
