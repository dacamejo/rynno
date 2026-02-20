const express = require('express');
const crypto = require('crypto');
const { runAdapter } = require('./src/tripParser');
const { generatePlaylist } = require('./services/playlistBuilder');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const tripStore = new Map();

app.get('/', (_req, res) => {
  res.json({
    name: 'Rynno Backend',
    status: 'ok',
    message: 'Share your SBB itinerary to generate a soundtrack.'
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/v1/trips/ingest', async (req, res) => {
  const { source, metadata = {}, payload, tripId: providedTripId } = req.body || {};

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing payload. Provide a `payload` object with trip details.' });
  }

  const tripId = providedTripId || crypto.randomUUID();
  try {
    const canonical = await runAdapter({ tripId, source, payload, metadata });
    const storeEntry = {
      status: 'complete',
      canonical,
      rawPayload: payload,
      source: source || payload.source || 'manual',
      metadata,
      lastUpdated: new Date().toISOString(),
      errors: []
    };
    tripStore.set(tripId, storeEntry);

    return res.status(201).json({ tripId, status: storeEntry.status, canonical });
  } catch (error) {
    const storeEntry = {
      status: 'error',
      canonical: null,
      rawPayload: payload,
      source: source || payload.source || 'manual',
      metadata,
      lastUpdated: new Date().toISOString(),
      errors: [error.message]
    };
    tripStore.set(tripId, storeEntry);

    console.error('Trip ingestion failed', { tripId, error: error.message });
    return res.status(400).json({ tripId, status: storeEntry.status, errors: storeEntry.errors });
  }
});

app.get('/api/v1/trips/:tripId/status', (req, res) => {
  const entry = tripStore.get(req.params.tripId);
  if (!entry) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  return res.json({ tripId: req.params.tripId, status: entry.status, canonical: entry.canonical, errors: entry.errors });
});

app.post('/api/v1/trips/:tripId/refresh', async (req, res) => {
  const entry = tripStore.get(req.params.tripId);
  if (!entry) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  entry.status = 'refreshing';
  entry.lastUpdated = new Date().toISOString();
  tripStore.set(req.params.tripId, entry);

  try {
    const canonical = await runAdapter({
      tripId: req.params.tripId,
      source: entry.source,
      payload: entry.rawPayload,
      metadata: entry.metadata
    });
    entry.status = 'complete';
    entry.canonical = canonical;
    entry.errors = [];
    entry.lastUpdated = new Date().toISOString();
    tripStore.set(req.params.tripId, entry);

    return res.json({ tripId: req.params.tripId, status: entry.status, canonical });
  } catch (error) {
    entry.status = 'error';
    entry.errors = [error.message];
    entry.lastUpdated = new Date().toISOString();
    tripStore.set(req.params.tripId, entry);

    console.error('Trip refresh failed', { tripId: req.params.tripId, error: error.message });
    return res.status(500).json({ tripId: req.params.tripId, status: entry.status, errors: entry.errors });
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
    console.error('Playlist generation failed', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Rynno backend listening on port ${port}`);
});
