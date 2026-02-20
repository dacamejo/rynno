const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { runAdapter } = require('./src/tripParser');
const { generatePlaylist } = require('./services/playlistBuilder');
const spotifyClient = require('./services/spotifyClient');
const {
  initDb,
  saveTripEntry,
  getTripEntry,
  upsertUser,
  saveOAuthToken,
  getOAuthToken
} = require('./src/db');

const app = express();
const port = process.env.PORT || 3000;
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SPOTIFY_SCOPES = 'playlist-modify-private playlist-modify-public user-read-private user-library-read';
const authStateStore = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

function getBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function buildSpotifyRedirectUri(req) {
  return `${getBaseUrl(req)}/auth/spotify/callback`;
}

function putAuthState(record) {
  const state = crypto.randomBytes(24).toString('hex');
  authStateStore.set(state, { ...record, createdAt: Date.now() });
  return state;
}

function consumeAuthState(state) {
  const record = authStateStore.get(state);
  if (!record) {
    return null;
  }
  authStateStore.delete(state);
  if (Date.now() - record.createdAt > AUTH_STATE_TTL_MS) {
    return null;
  }
  return record;
}

function cleanupExpiredAuthStates() {
  const now = Date.now();
  for (const [state, record] of authStateStore.entries()) {
    if (now - record.createdAt > AUTH_STATE_TTL_MS) {
      authStateStore.delete(state);
    }
  }
}

function resolveUserId(query = {}) {
  return query.userId || query.user_id || crypto.randomUUID();
}

function buildReauthSignal({ userId, reason }) {
  return {
    required: true,
    userId,
    reason,
    nextStep: 'Re-authenticate via GET /auth/spotify?userId=<id>'
  };
}

function getErrorCauseDetails(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.response) {
    const { status, data } = error.response;
    if (typeof data === 'string' && data.trim()) {
      return `HTTP ${status}: ${data}`;
    }

    if (data && typeof data === 'object') {
      const responseError = data.error_description || data.error?.message || data.error || data.message;
      if (responseError) {
        return `HTTP ${status}: ${responseError}`;
      }
      return `HTTP ${status}: ${JSON.stringify(data)}`;
    }

    return `HTTP ${status}`;
  }

  const parts = [error.message];
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.cause && error.cause !== error.message) {
    parts.push(`cause=${error.cause}`);
  }

  return parts.filter(Boolean).join(' | ') || 'Unknown error';
}

async function createStoreEntry({ canonical, payload, metadata, source, status, errors }) {
  return {
    status,
    canonical,
    rawPayload: payload,
    source,
    metadata,
    lastUpdated: new Date().toISOString(),
    errors: errors || []
  };
}

app.get('/auth/spotify', (req, res) => {
  cleanupExpiredAuthStates();

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Missing SPOTIFY_CLIENT_ID environment variable.' });
  }

  const userId = resolveUserId(req.query);
  const tripId = req.query.tripId || null;
  const scopes = req.query.scopes || process.env.SPOTIFY_SCOPES || DEFAULT_SPOTIFY_SCOPES;
  const state = putAuthState({ userId, tripId });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: buildSpotifyRedirectUri(req),
    scope: scopes,
    state,
    show_dialog: req.query.showDialog === 'true' ? 'true' : 'false'
  });

  return res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/auth/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({ error: `Spotify authorization failed: ${error}` });
  }

  if (!state) {
    return res.status(400).json({ error: 'Missing OAuth state.' });
  }

  const authRecord = consumeAuthState(state);
  if (!authRecord) {
    return res.status(400).json({ error: 'Invalid or expired OAuth state.' });
  }

  try {
    const tokenResponse = await spotifyClient.exchangeAuthorizationCode({
      code,
      redirectUri: buildSpotifyRedirectUri(req)
    });

    const profile = await spotifyClient.getUserProfile(tokenResponse.accessToken);
    await upsertUser({
      userId: authRecord.userId,
      email: profile.email || null,
      spotifyUserId: profile.id,
      locale: profile.country || null
    });

    const expiresAt = new Date(Date.now() + (tokenResponse.expiresIn || 3600) * 1000).toISOString();
    await saveOAuthToken({
      userId: authRecord.userId,
      provider: 'spotify',
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.tokenType,
      expiresAt,
      metadata: {
        spotifyUserId: profile.id,
        tripId: authRecord.tripId,
        displayName: profile.display_name || null
      }
    });

    return res.status(200).json({
      status: 'connected',
      userId: authRecord.userId,
      tripId: authRecord.tripId,
      spotifyUserId: profile.id,
      expiresAt
    });
  } catch (callbackError) {
    const details = getErrorCauseDetails(callbackError);
    console.error('Spotify callback failed', { error: details });
    return res.status(500).json({
      error: 'Unable to finish Spotify authorization flow.',
      details,
      hint: 'Check Spotify app credentials, redirect URI, and authorization code validity.'
    });
  }
});

app.post('/api/spotify/refresh', async (req, res) => {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (internalApiKey && req.get('x-api-key') !== internalApiKey) {
    return res.status(401).json({ error: 'Unauthorized refresh attempt.' });
  }

  const userId = req.body?.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }

  const tokenEntry = await getOAuthToken(userId, 'spotify');
  if (!tokenEntry) {
    return res.status(404).json({ error: 'Spotify token not found for user.' });
  }

  if (!tokenEntry.refreshToken) {
    return res.status(400).json({
      error: 'Missing refresh token for user.',
      reauth: buildReauthSignal({ userId, reason: 'missing_refresh_token' })
    });
  }

  try {
    const refreshed = await spotifyClient.refreshAccessToken(tokenEntry.refreshToken);
    const expiresAt = new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000).toISOString();

    await saveOAuthToken({
      userId,
      provider: 'spotify',
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || tokenEntry.refreshToken,
      scope: refreshed.scope || tokenEntry.scope,
      tokenType: refreshed.tokenType || tokenEntry.tokenType,
      expiresAt,
      metadata: tokenEntry.metadata || {}
    });

    return res.json({ status: 'refreshed', userId, expiresAt });
  } catch (refreshError) {
    const details = getErrorCauseDetails(refreshError);
    const needsReauth = /invalid_grant/i.test(details);
    return res.status(400).json({
      error: 'Unable to refresh Spotify token.',
      details,
      reauth: needsReauth ? buildReauthSignal({ userId, reason: 'invalid_grant' }) : null
    });
  }
});

app.get('/api/spotify/tokens/:userId', async (req, res) => {
  const tokenEntry = await getOAuthToken(req.params.userId, 'spotify');
  if (!tokenEntry) {
    return res.status(404).json({ error: 'Token metadata not found.' });
  }

  return res.json({
    userId: tokenEntry.userId,
    provider: tokenEntry.provider,
    scope: tokenEntry.scope,
    tokenType: tokenEntry.tokenType,
    expiresAt: tokenEntry.expiresAt,
    lastRefreshedAt: tokenEntry.lastRefreshedAt,
    metadata: tokenEntry.metadata
  });
});

app.post('/api/v1/trips/ingest', async (req, res) => {
  const { source, metadata = {}, payload, tripId: providedTripId } = req.body || {};

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing payload. Provide a `payload` object with trip details.' });
  }

  const tripId = providedTripId || crypto.randomUUID();
  const normalizedSource = source || payload.source || 'manual';

  try {
    const canonical = await runAdapter({ tripId, source: normalizedSource, payload, metadata });
    const storeEntry = await createStoreEntry({
      canonical,
      payload,
      metadata,
      source: normalizedSource,
      status: 'complete'
    });

    await saveTripEntry(tripId, storeEntry);
    return res.status(201).json({
      tripId,
      status: storeEntry.status,
      canonical,
      manualCorrectionRequired: canonical?.validation?.needsManualReview || false,
      manualCorrectionPrompt:
        canonical?.validation?.needsManualReview
          ? 'We need a few more trip details to fine-tune your playlist. Please confirm route and timing.'
          : null
    });
  } catch (error) {
    const details = getErrorCauseDetails(error);
    const storeEntry = await createStoreEntry({
      canonical: null,
      payload,
      metadata,
      source: normalizedSource,
      status: 'error',
      errors: [details]
    });

    await saveTripEntry(tripId, storeEntry);
    console.error('Trip ingestion failed', { tripId, error: details });
    return res.status(400).json({ tripId, status: storeEntry.status, errors: storeEntry.errors });
  }
});

app.get('/api/v1/trips/:tripId/status', async (req, res) => {
  const entry = await getTripEntry(req.params.tripId);
  if (!entry) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  return res.json({ tripId: req.params.tripId, status: entry.status, canonical: entry.canonical, errors: entry.errors });
});

app.get('/share-target', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share-target.html'));
});

app.post('/share-target', (_req, res) => {
  return res.redirect(303, '/share-target');
});

app.post('/api/v1/trips/:tripId/refresh', async (req, res) => {
  const entry = await getTripEntry(req.params.tripId);
  if (!entry) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  const tripId = req.params.tripId;
  const payload = entry.rawPayload || {};
  const metadata = entry.metadata || {};

  try {
    const canonical = await runAdapter({ tripId, source: entry.source, payload, metadata });
    const updatedEntry = await createStoreEntry({
      canonical,
      payload,
      metadata,
      source: entry.source,
      status: 'complete'
    });

    await saveTripEntry(tripId, updatedEntry);
    return res.json({
      tripId,
      status: updatedEntry.status,
      canonical,
      manualCorrectionRequired: canonical?.validation?.needsManualReview || false
    });
  } catch (error) {
    const details = getErrorCauseDetails(error);
    const updatedEntry = await createStoreEntry({
      canonical: null,
      payload,
      metadata,
      source: entry.source,
      status: 'error',
      errors: [details]
    });

    await saveTripEntry(tripId, updatedEntry);
    console.error('Trip refresh failed', { tripId, error: details });
    return res.status(500).json({ tripId, status: updatedEntry.status, errors: updatedEntry.errors });
  }
});

app.post('/api/v1/playlists/generate', async (req, res) => {
  const { trip, preferences = {}, spotify = {} } = req.body || {};

  if (!trip) {
    return res.status(400).json({ error: 'Trip data is required to build a playlist.' });
  }
  if (!spotify.accessToken && !spotify.refreshToken) {
    return res.status(400).json({ error: 'Spotify accessToken or refreshToken is required to generate playlists.' });
  }

  try {
    const playlist = await generatePlaylist({ trip, preferences, spotify });
    return res.status(200).json(playlist);
  } catch (error) {
    const details = getErrorCauseDetails(error);
    console.error('Playlist generation failed', { error: details });
    return res.status(500).json({
      error: 'Playlist generation failed.',
      details
    });
  }
});

app.get('/api/trip-parser/contract', (_req, res) => {
  return res.json({
    endpoint: '/api/v1/trips/ingest',
    method: 'POST',
    request: {
      source: 'string',
      metadata: 'object',
      payload: {
        sharedTitle: 'string',
        sharedText: 'string',
        sharedUrl: 'string'
      }
    },
    response: {
      tripId: 'string',
      status: 'complete|error',
      canonical: 'object',
      manualCorrectionRequired: 'boolean',
      manualCorrectionPrompt: 'string|null'
    }
  });
});

app.post('/api/trip-parser', async (req, res) => {
  const retries = Math.max(0, Math.min(2, Number(req.query.retries || 1)));
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      const response = await fetch(`${getBaseUrl(req)}/api/v1/trips/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          `Ingest endpoint responded with HTTP ${response.status}: ${
            result.errors?.join(', ') || result.error || 'Parser request failed'
          }`
        );
      }

      return res.status(200).json({ ...result, attempts: attempt + 1 });
    } catch (error) {
      lastError = error;
      attempt += 1;
    }
  }

  return res.status(502).json({
    error: 'Trip parser request failed after retries.',
    details: getErrorCauseDetails(lastError),
    attempts: attempt
  });
});

async function startServer() {
  await initDb();
  app.listen(port, () => {
    console.log(`Rynno backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
