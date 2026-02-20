const express = require('express');
const crypto = require('crypto');
const { runAdapter } = require('./src/tripParser');
const { generatePlaylist } = require('./services/playlistBuilder');
const { initDb, saveTripEntry, getTripEntry } = require('./src/db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

async function createStoreEntry({ tripId, canonical, payload, metadata, source, status, errors }) {
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
      tripId,
      canonical,
      payload,
      metadata,
      source: normalizedSource,
      status: 'complete'
    });

    await saveTripEntry(tripId, storeEntry);
    return res.status(201).json({ tripId, status: storeEntry.status, canonical });
  } catch (error) {
    const storeEntry = await createStoreEntry({
      tripId,
      canonical: null,
      payload,
      metadata,
      source: normalizedSource,
      status: 'error',
      errors: [error.message]
    });

    await saveTripEntry(tripId, storeEntry);
    console.error('Trip ingestion failed', { tripId, error: error.message });
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
      tripId,
      canonical,
      payload,
      metadata,
      source: entry.source,
      status: 'complete'
    });

    await saveTripEntry(tripId, updatedEntry);
    return res.json({ tripId, status: updatedEntry.status, canonical });
  } catch (error) {
    const updatedEntry = await createStoreEntry({
      tripId,
      canonical: null,
      payload,
      metadata,
      source: entry.source,
      status: 'error',
      errors: [error.message]
    });

    await saveTripEntry(tripId, updatedEntry);
    console.error('Trip refresh failed', { tripId, error: error.message });
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
    console.error('Playlist generation failed', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
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
