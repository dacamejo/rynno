const swStatus = document.getElementById('sw-status');
const spotifyStatus = document.getElementById('spotify-status');
const spotifyProfile = document.getElementById('spotify-profile');
const spotifyAvatar = document.getElementById('spotify-avatar');
const spotifyDisplayName = document.getElementById('spotify-display-name');
const spotifyAccountId = document.getElementById('spotify-account-id');
const simulateShareButton = document.getElementById('simulate-share');
const loaderCard = document.getElementById('loader-card');
const tripReviewCard = document.getElementById('trip-review');
const playlistPanel = document.getElementById('playlist-panel');
const tripSummary = document.getElementById('trip-summary');
const companionChipsContainer = document.getElementById('companion-chips');
const moodInput = document.getElementById('mood-input');
const languageSelect = document.getElementById('language-select');
const regionSelect = document.getElementById('region-select');
const preferenceSummary = document.getElementById('preference-summary');
const validationHints = document.getElementById('validation-hints');
const tripActionStatus = document.getElementById('trip-action-status');
const regeneratePlaylistButton = document.getElementById('regenerate-playlist');
const refreshTripButton = document.getElementById('refresh-trip');
const scheduleReminderButton = document.getElementById('schedule-reminder');
const openOauthButton = document.getElementById('open-oauth');
const spotifyUserIdInput = document.getElementById('spotify-user-id');
const playlistTitle = document.getElementById('playlist-title');
const playlistMessage = document.getElementById('playlist-message');
const playlistMeta = document.getElementById('playlist-meta');
const playlistStory = document.getElementById('playlist-story');
const playlistQualityMeta = document.getElementById('playlist-quality-meta');
const playlistCover = document.getElementById('playlist-cover');
const openSpotifyLink = document.getElementById('open-spotify-link');
const copyPlaylistLink = document.getElementById('copy-playlist-link');
const emailPlaylistLink = document.getElementById('email-playlist-link');
const playlistCtaStatus = document.getElementById('playlist-cta-status');
const playlistTracks = document.getElementById('playlist-tracks');
const playlistContract = window.PlaylistContract;

const SPOTIFY_AUTH_STORAGE_KEY = 'rynno.spotify.auth';
const TRIP_PLAYLIST_CACHE_KEY = 'rynno.trip.playlist.cache.v1';
const COMPANIONS = ['Solo', 'Couple', 'Family', 'Kids', 'Friends'];
const selectedCompanions = new Set(['Solo']);
const tripTemplate = {
  source: 'manual',
  metadata: {
    flow: 'mobile_prototype',
    capturedAt: new Date().toISOString()
  },
  payload: {
    from: 'Lausanne',
    to: 'Zermatt',
    date: '2026-03-14',
    time: '18:15',
    sharedTitle: 'Lausanne → Zermatt',
    sharedText: 'Transit route via Visp, evening departure around 18:15.',
    sharedUrl: 'https://www.sbb.ch/en'
  }
};

const GENERATION_STATE = {
  idle: 'idle',
  submitting: 'submitting',
  success: 'success',
  partial_success: 'partial_success',
  error_auth: 'error_auth',
  error_validation: 'error_validation',
  error_network: 'error_network'
};

let activeTripId = null;
let activeTripCanonical = null;
let generationState = GENERATION_STATE.idle;
let latestPlaylist = null;

function readStoredSpotifyAuth() {
  try {
    const raw = localStorage.getItem(SPOTIFY_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredSpotifyAuth(auth) {
  localStorage.setItem(SPOTIFY_AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function readPlaylistCache() {
  try {
    return JSON.parse(localStorage.getItem(TRIP_PLAYLIST_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePlaylistForTrip(tripId, playlist) {
  const cache = readPlaylistCache();
  cache[tripId] = {
    cachedAt: new Date().toISOString(),
    playlist
  };
  localStorage.setItem(TRIP_PLAYLIST_CACHE_KEY, JSON.stringify(cache));
}

function readPlaylistForTrip(tripId) {
  if (!tripId) return null;
  const cache = readPlaylistCache();
  return cache[tripId]?.playlist || null;
}

function renderSpotifyAuth(auth) {
  if (!auth?.userId || !auth?.spotifyUserId) {
    spotifyStatus.textContent = 'Spotify auth: Not connected';
    spotifyStatus.classList.remove('status-good');
    spotifyProfile.classList.add('hidden');
    return;
  }

  spotifyStatus.textContent = 'Spotify connected';
  spotifyStatus.classList.add('status-good');
  spotifyProfile.classList.remove('hidden');
  spotifyDisplayName.textContent = auth.displayName || 'Spotify user';
  spotifyAccountId.textContent = `Spotify ID: ${auth.spotifyUserId}`;
  spotifyAvatar.src = auth.avatarUrl || 'https://developer.spotify.com/assets/branding-guidelines/icon3@2x.png';
  spotifyUserIdInput.value = auth.userId;
}

function consumeSpotifyAuthCallback() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('spotifyAuth') !== 'connected') return;

  const auth = {
    userId: url.searchParams.get('userId') || '',
    spotifyUserId: url.searchParams.get('spotifyUserId') || '',
    expiresAt: url.searchParams.get('expiresAt') || null,
    displayName: url.searchParams.get('displayName') || null,
    avatarUrl: url.searchParams.get('avatarUrl') || null,
    tripId: url.searchParams.get('tripId') || null
  };

  if (auth.userId && auth.spotifyUserId) {
    saveStoredSpotifyAuth(auth);
    renderSpotifyAuth(auth);
  }

  ['spotifyAuth', 'userId', 'spotifyUserId', 'expiresAt', 'displayName', 'avatarUrl', 'tripId'].forEach((key) => {
    url.searchParams.delete(key);
  });
  history.replaceState({}, '', url.toString());
}

function renderCompanions() {
  companionChipsContainer.innerHTML = '';
  COMPANIONS.forEach((companion) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = companion;
    chip.setAttribute('aria-pressed', String(selectedCompanions.has(companion)));
    chip.addEventListener('click', () => {
      if (selectedCompanions.has(companion)) {
        selectedCompanions.delete(companion);
      } else {
        selectedCompanions.add(companion);
      }

      if (!selectedCompanions.size) {
        selectedCompanions.add('Solo');
      }

      renderCompanions();
      renderPreferenceSummary();
      tripActionStatus.textContent = `Updated companions: ${Array.from(selectedCompanions).join(', ')}`;
    });

    companionChipsContainer.appendChild(chip);
  });
}

function renderPreferenceSummary() {
  const companions = Array.from(selectedCompanions).join(', ');
  const language = languageSelect.value || 'english';
  const region = regionSelect.value || 'alps';
  const mood = moodInput.value.trim() || 'Open mood';
  preferenceSummary.textContent = `You’re generating: ${companions} · ${capitalize(language)} · ${capitalize(region)} · ${mood}`;

  const auth = readStoredSpotifyAuth();
  if (!auth?.userId || !auth?.spotifyUserId) {
    validationHints.textContent = 'Tip: connect Spotify before generation to avoid auth errors.';
  } else if (!activeTripId) {
    validationHints.textContent = 'Tip: load a shared trip before submitting generation.';
  } else {
    validationHints.textContent = 'Ready to generate with your selected playlist preferences.';
  }
}

function capitalize(value = '') {
  return value
    .split(' ')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    const error = new Error('Network request failed. Check your connection and try again.');
    error.category = GENERATION_STATE.error_network;
    throw error;
  }

  const body = await response.json().catch(() => ({ error: 'Non-JSON response' }));
  if (!response.ok) {
    const message = body.error || body.details || body.errors?.join(', ') || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.code = body.code;
    if (response.status === 401 || body.code === 'SPOTIFY_AUTH_REQUIRED') {
      error.category = GENERATION_STATE.error_auth;
    } else if (response.status === 400 || body.code === 'VALIDATION_ERROR') {
      error.category = GENERATION_STATE.error_validation;
    } else {
      error.category = GENERATION_STATE.error_network;
    }
    throw error;
  }

  return body;
}

function buildPlaylistRequestPayload() {
  return playlistContract.buildPlaylistRequestPayload({
    activeTripCanonical,
    activeTripId,
    selectedCompanions: Array.from(selectedCompanions),
    mood: moodInput.value.trim(),
    language: languageSelect.value || 'english',
    region: regionSelect.value || 'alps',
    auth: readStoredSpotifyAuth(),
    latestPlaylist
  });
}

async function emitTelemetryEvent(eventType, { outcome = null, context = {} } = {}) {
  const auth = readStoredSpotifyAuth();
  try {
    await fetch('/api/v1/feedback/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType,
        userId: auth?.userId || null,
        tripId: activeTripId,
        playlistId: latestPlaylist?.playlistId || null,
        outcome,
        context
      })
    });
  } catch {
    // Telemetry should never block UX interactions.
  }
}

function renderPlaylistCtas(playlist) {
  playlistCtaStatus.textContent = '';
  openSpotifyLink.classList.add('hidden');
  copyPlaylistLink.classList.add('hidden');
  emailPlaylistLink.classList.add('hidden');

  if (!playlist?.playlistUrl) {
    playlistCtaStatus.textContent = 'Spotify deep link unavailable for this playlist response.';
    return;
  }

  openSpotifyLink.href = playlist.playlistUrl;
  openSpotifyLink.classList.remove('hidden');
  copyPlaylistLink.classList.remove('hidden');
  emailPlaylistLink.classList.remove('hidden');
  emailPlaylistLink.href = `mailto:?subject=${encodeURIComponent(playlist.playlistName || 'Your Rynno playlist')}&body=${encodeURIComponent(`Open your playlist: ${playlist.playlistUrl}`)}`;
}

function renderQualityMeta(playlist) {
  playlistQualityMeta.innerHTML = '';
  const trackCount = (playlist?.tracks || []).length;
  const totalDurationMinutes = Math.max(
    1,
    Math.round((playlist?.tracks || []).reduce((sum, track) => sum + (track.durationMs || 0), 0) / 60000)
  );
  const guardrailTries = (playlist?.guardrailAttempts || []).length || 1;
  const qualityItems = [
    { label: 'Tracks', value: String(trackCount) },
    { label: 'Duration', value: `${totalDurationMinutes} min` },
    { label: 'Guardrail tries', value: String(guardrailTries) },
    { label: 'Region flavor', value: capitalize(regionSelect.value || 'alps') }
  ];

  qualityItems.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'meta-item';
    el.innerHTML = `<strong>${item.label}</strong><br /><span class="small">${item.value}</span>`;
    playlistQualityMeta.appendChild(el);
  });
}

function renderPlaylistOutput(playlist) {
  const safePlaylist = playlistContract.normalizePlaylistForRender(playlist);

  if (!playlist) {
    playlistTitle.textContent = 'Playlist output';
    playlistMeta.textContent = 'No generated playlist yet.';
    playlistStory.textContent = 'Generate a playlist to see trip storytelling details.';
    playlistCover.classList.add('hidden');
    renderPlaylistCtas(null);
    playlistQualityMeta.innerHTML = '';
    playlistTracks.innerHTML = '';
    return;
  }

  playlistTitle.textContent = safePlaylist.playlistName || 'Generated playlist';
  playlistMeta.textContent = safePlaylist.playlistUrl || 'Playlist created. Open in Spotify from your account.';
  playlistStory.textContent =
    safePlaylist.moodProfile?.playlistDescription ||
    'Storyline unavailable. We still generated a route-aware playlist using your trip context.';
  const coverUrl = safePlaylist.images?.[0]?.url || safePlaylist.coverImageUrl || null;
  if (coverUrl) {
    playlistCover.src = coverUrl;
    playlistCover.classList.remove('hidden');
  } else {
    playlistCover.classList.add('hidden');
  }
  renderPlaylistCtas(safePlaylist);
  renderQualityMeta(safePlaylist);
  playlistTracks.innerHTML = '';

  (safePlaylist.tracks || []).slice(0, 8).forEach((track) => {
    const row = document.createElement('div');
    row.className = 'track';
    const tags = [
      track.regionSurprise ? '<span class="quality-tag good">Regional surprise</span>' : '',
      track.explicit ? '<span class="quality-tag warn">Explicit</span>' : '<span class="quality-tag">Clean leaning</span>'
    ].join('');
    row.innerHTML = `<strong>${track.position}. ${track.name}</strong><br /><span class="small">${(track.artists || []).join(', ') || 'Unknown artist'}</span><div>${tags}</div>`;
    playlistTracks.appendChild(row);
  });

  if (!(safePlaylist.tracks || []).length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'track';
    emptyState.textContent = 'No tracks were returned. Try adjusting preferences and regenerating.';
    playlistTracks.appendChild(emptyState);
  }
}

function renderGenerationState() {
  const buttonLabels = {
    [GENERATION_STATE.idle]: latestPlaylist ? 'Regenerate playlist' : 'Generate playlist',
    [GENERATION_STATE.submitting]: 'Generating…',
    [GENERATION_STATE.success]: 'Regenerate playlist',
    [GENERATION_STATE.partial_success]: 'Regenerate playlist',
    [GENERATION_STATE.error_auth]: 'Retry generation',
    [GENERATION_STATE.error_validation]: 'Retry generation',
    [GENERATION_STATE.error_network]: 'Retry generation'
  };

  regeneratePlaylistButton.textContent = buttonLabels[generationState] || 'Generate playlist';
  regeneratePlaylistButton.disabled = generationState === GENERATION_STATE.submitting;
  regeneratePlaylistButton.setAttribute('aria-busy', String(generationState === GENERATION_STATE.submitting));

  const helperCopy = {
    [GENERATION_STATE.idle]: 'Ready to generate when you are.',
    [GENERATION_STATE.submitting]: 'Creating your Spotify playlist…',
    [GENERATION_STATE.success]: 'Playlist generated successfully.',
    [GENERATION_STATE.partial_success]: 'Playlist generated with guardrail recovery.',
    [GENERATION_STATE.error_auth]: 'Reconnect Spotify to continue.',
    [GENERATION_STATE.error_validation]: 'Adjust trip preferences and try again.',
    [GENERATION_STATE.error_network]: 'Network/server error. Retry generation.'
  };

  playlistMessage.textContent = helperCopy[generationState] || '';
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    swStatus.textContent = 'Service worker unavailable in this browser.';
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    swStatus.textContent = 'Service worker ready for share-target flow.';
    swStatus.classList.add('status-good');
  } catch (error) {
    swStatus.textContent = `Service worker failed: ${error.message}`;
  }
}

function setTripSummary(statusResult) {
  activeTripCanonical = statusResult.canonical || null;
  const route = statusResult.canonical?.route || {};
  const timing = statusResult.canonical?.timing || {};
  tripSummary.textContent = `${route.origin || 'Origin'} → ${route.destination || 'Destination'} · Depart ${
    timing.departureTime || 'TBD'
  }`;
}

function restoreCachedPlaylist() {
  latestPlaylist = readPlaylistForTrip(activeTripId);
  if (latestPlaylist) {
    generationState = GENERATION_STATE.success;
    renderPlaylistOutput(latestPlaylist);
  } else {
    generationState = GENERATION_STATE.idle;
    renderPlaylistOutput(null);
  }
  renderGenerationState();
}

async function simulateShareIngest() {
  loaderCard.classList.remove('hidden');
  tripReviewCard.classList.add('hidden');
  playlistPanel.classList.add('hidden');
  tripActionStatus.textContent = 'Syncing trip data...';

  try {
    const ingestResult = await requestJson('/api/v1/trips/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tripTemplate)
    });

    activeTripId = ingestResult.tripId;

    const statusResult = await requestJson(`/api/v1/trips/${encodeURIComponent(activeTripId)}/status`);
    setTripSummary(statusResult);

    tripReviewCard.classList.remove('hidden');
    playlistPanel.classList.remove('hidden');
    restoreCachedPlaylist();
    tripActionStatus.textContent = `Trip ready (${activeTripId}). Configure preferences and generate.`;
  } catch (error) {
    tripActionStatus.textContent = error.message;
  } finally {
    loaderCard.classList.add('hidden');
  }
}

async function refreshTripTiming() {
  if (!activeTripId) {
    tripActionStatus.textContent = 'Load a shared trip first.';
    return;
  }

  try {
    const refresh = await requestJson(`/api/v1/trips/${encodeURIComponent(activeTripId)}/refresh`, { method: 'POST' });
    setTripSummary(refresh);
    tripActionStatus.textContent = `Trip timing refreshed (${refresh.status}).`;
  } catch (error) {
    tripActionStatus.textContent = error.message;
  }
}

async function regeneratePlaylist() {
  if (!activeTripId || !activeTripCanonical) {
    tripActionStatus.textContent = 'Load a shared trip first.';
    return;
  }

  if (generationState === GENERATION_STATE.submitting) {
    return;
  }

  const wasRetry = generationState.startsWith('error_');
  emitTelemetryEvent(wasRetry ? 'retry_generate' : 'click_generate', {
    context: { generationState }
  });

  const auth = readStoredSpotifyAuth();
  if (!auth?.userId || !auth?.spotifyUserId) {
    generationState = GENERATION_STATE.error_auth;
    renderGenerationState();
    renderPreferenceSummary();
    tripActionStatus.textContent = 'Spotify is not connected. Connect Spotify and retry generation.';
    emitTelemetryEvent('generate_failure', {
      outcome: GENERATION_STATE.error_auth,
      context: { reason: 'spotify_not_connected' }
    });
    return;
  }

  generationState = GENERATION_STATE.submitting;
  renderGenerationState();
  renderPreferenceSummary();
  tripActionStatus.textContent = 'Submitting playlist generation...';

  const idempotencyKey = `playlist-generate:${activeTripId}:${crypto.randomUUID()}`;

  try {
    const payload = buildPlaylistRequestPayload();
    const playlist = await requestJson('/api/v1/playlists/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    latestPlaylist = playlist;
    savePlaylistForTrip(activeTripId, playlist);
    const hadGuardrailRecovery = (playlist.guardrailAttempts || []).some((attempt) => !attempt.pass);
    generationState = hadGuardrailRecovery ? GENERATION_STATE.partial_success : GENERATION_STATE.success;
    renderPlaylistOutput(playlist);
    renderGenerationState();
    tripActionStatus.textContent = `Playlist ready: ${playlist.playlistName || playlist.playlistId}.`;
    emitTelemetryEvent('generate_success', {
      outcome: generationState,
      context: { hadGuardrailRecovery }
    });
  } catch (error) {
    generationState = error.category || GENERATION_STATE.error_network;
    renderGenerationState();

    if (generationState === GENERATION_STATE.error_auth) {
      tripActionStatus.textContent = 'Spotify session missing or expired. Reconnect Spotify, then retry.';
    } else if (generationState === GENERATION_STATE.error_validation) {
      tripActionStatus.textContent = `Validation issue: ${error.message}`;
    } else {
      tripActionStatus.textContent = `Generation failed: ${error.message}`;
    }

    emitTelemetryEvent('generate_failure', {
      outcome: generationState,
      context: { message: error.message }
    });
  }
}

async function scheduleReminder() {
  if (!activeTripId) {
    tripActionStatus.textContent = 'Load a shared trip first.';
    return;
  }

  try {
    const userId = spotifyUserIdInput.value.trim() || null;
    const reminder = await requestJson(`/api/v1/trips/${encodeURIComponent(activeTripId)}/reminders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leadMinutes: 20,
        channel: 'in_app',
        userId,
        autoRefreshPlaylist: true
      })
    });

    tripActionStatus.textContent = `Reminder scheduled for ${reminder.reminder.scheduledFor}.`;
  } catch (error) {
    tripActionStatus.textContent = error.message;
  }
}

function openOauth() {
  const userId = spotifyUserIdInput.value.trim() || crypto.randomUUID();
  spotifyUserIdInput.value = userId;

  const returnTo = `${window.location.origin}${window.location.pathname}`;
  const oauthUrl = `/auth/spotify?userId=${encodeURIComponent(userId)}&returnTo=${encodeURIComponent(returnTo)}`;
  window.location.assign(oauthUrl);
}

async function copyPlaylistUrl() {
  if (!latestPlaylist?.playlistUrl) return;

  try {
    await navigator.clipboard.writeText(latestPlaylist.playlistUrl);
    playlistCtaStatus.textContent = 'Playlist link copied.';
  } catch {
    playlistCtaStatus.textContent = 'Clipboard not available. Copy from the Open in Spotify link.';
  }
}

simulateShareButton.addEventListener('click', simulateShareIngest);
regeneratePlaylistButton.addEventListener('click', regeneratePlaylist);
refreshTripButton.addEventListener('click', refreshTripTiming);
scheduleReminderButton.addEventListener('click', scheduleReminder);
openOauthButton.addEventListener('click', openOauth);
copyPlaylistLink.addEventListener('click', copyPlaylistUrl);
openSpotifyLink.addEventListener('click', () => {
  emitTelemetryEvent('open_spotify_click', {
    outcome: 'clicked',
    context: { hasPlaylistUrl: Boolean(latestPlaylist?.playlistUrl) }
  });
});
languageSelect.addEventListener('change', renderPreferenceSummary);
regionSelect.addEventListener('change', renderPreferenceSummary);
moodInput.addEventListener('input', renderPreferenceSummary);

renderCompanions();
renderGenerationState();
setupServiceWorker();
consumeSpotifyAuthCallback();
renderSpotifyAuth(readStoredSpotifyAuth());
renderPreferenceSummary();
