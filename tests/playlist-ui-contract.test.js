const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMoodHints,
  buildPlaylistRequestPayload,
  normalizePlaylistForRender
} = require('../public/playlist-contract');

test('buildMoodHints maps descriptive text to hint flags', () => {
  const hints = buildMoodHints('cozy cinematic sunrise with gentle focus');
  assert.equal(hints.calm, true);
  assert.equal(hints.cinematic, true);
  assert.equal(hints.reflective, true);
  assert.equal(hints.energetic, false);
});

test('buildPlaylistRequestPayload builds stable contract for API call', () => {
  const payload = buildPlaylistRequestPayload({
    activeTripCanonical: { route: { origin: 'Lausanne', destination: 'Zermatt' }, metadata: { source: 'manual' } },
    activeTripId: 'trip-123',
    selectedCompanions: ['Family', 'Kids'],
    mood: 'calm sunset',
    language: 'english',
    region: 'mixed switzerland',
    auth: { userId: 'user-1', spotifyUserId: 'spotify-1' },
    latestPlaylist: { playlistId: 'playlist-0' }
  });

  assert.equal(payload.trip.tripId, 'trip-123');
  assert.deepEqual(payload.preferences.tags, ['family', 'kids', 'mixed-switzerland']);
  assert.equal(payload.spotify.userId, 'user-1');
  assert.equal(payload.regeneratedFromPlaylistId, 'playlist-0');
  assert.equal(payload.isRegeneration, true);
});

test('normalizePlaylistForRender guards invalid response shapes', () => {
  const safe = normalizePlaylistForRender({ playlistName: 'Trip Mix', tracks: null, moodProfile: 'bad-shape' });
  assert.equal(safe.playlistName, 'Trip Mix');
  assert.deepEqual(safe.tracks, []);
  assert.deepEqual(safe.moodProfile, {});
  assert.deepEqual(safe.guardrailAttempts, []);
});
