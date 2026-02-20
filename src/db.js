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
      to_regclass('public.oauth_tokens') AS oauth_tokens_table;`
  );
  if (!result.rows[0]?.trips_table) {
    throw new Error('Missing `trips` table. Run `npm run db:migrate` before starting the server.');
  }
  if (!result.rows[0]?.users_table || !result.rows[0]?.oauth_tokens_table) {
    throw new Error('Missing auth-related tables. Run `npm run db:migrate` before starting the server.');
  }
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
  if (pool) {
    await pool.query(
      `INSERT INTO trips (trip_id, status, canonical, raw_payload, source, metadata, last_updated, errors, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (trip_id) DO UPDATE SET
         status = EXCLUDED.status,
         canonical = EXCLUDED.canonical,
         raw_payload = EXCLUDED.raw_payload,
         source = EXCLUDED.source,
         metadata = EXCLUDED.metadata,
         last_updated = EXCLUDED.last_updated,
         errors = EXCLUDED.errors,
         updated_at = NOW();`,
      [
        tripId,
        entry.status,
        entry.canonical,
        entry.rawPayload,
        entry.source,
        entry.metadata,
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
  getOAuthToken
};
