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
const tripActionStatus = document.getElementById('trip-action-status');
const regeneratePlaylistButton = document.getElementById('regenerate-playlist');
const scheduleReminderButton = document.getElementById('schedule-reminder');
const openOauthButton = document.getElementById('open-oauth');
const spotifyUserIdInput = document.getElementById('spotify-user-id');

const SPOTIFY_AUTH_STORAGE_KEY = 'rynno.spotify.auth';
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

let activeTripId = null;

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
      tripActionStatus.textContent = `Updated companions: ${Array.from(selectedCompanions).join(', ')}`;
    });

    companionChipsContainer.appendChild(chip);
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({ error: 'Non-JSON response' }));
  if (!response.ok) {
    const message = body.error || body.details || body.errors?.join(', ') || 'Request failed';
    throw new Error(message);
  }

  return body;
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
    const route = statusResult.canonical?.route || {};
    const timing = statusResult.canonical?.timing || {};
    tripSummary.textContent = `${route.origin || 'Origin'} → ${route.destination || 'Destination'} · Depart ${
      timing.departureTime || 'TBD'
    }`;

    tripReviewCard.classList.remove('hidden');
    playlistPanel.classList.remove('hidden');
    tripActionStatus.textContent = `Trip ready (${activeTripId}). Adjust companions/mood and regenerate.`;
  } catch (error) {
    tripActionStatus.textContent = error.message;
  } finally {
    loaderCard.classList.add('hidden');
  }
}

async function regeneratePlaylist() {
  if (!activeTripId) {
    tripActionStatus.textContent = 'Load a shared trip first.';
    return;
  }

  try {
    const refresh = await requestJson(`/api/v1/trips/${encodeURIComponent(activeTripId)}/refresh`, { method: 'POST' });
    const mood = moodInput.value.trim() || 'none';
    tripActionStatus.textContent = `Inputs refreshed (${refresh.status}) with companions: ${Array.from(selectedCompanions).join(', ')} · mood: ${mood}. (Preview card remains mocked in this prototype.)`;
  } catch (error) {
    tripActionStatus.textContent = error.message;
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

simulateShareButton.addEventListener('click', simulateShareIngest);
regeneratePlaylistButton.addEventListener('click', regeneratePlaylist);
scheduleReminderButton.addEventListener('click', scheduleReminder);
openOauthButton.addEventListener('click', openOauth);

renderCompanions();
setupServiceWorker();
consumeSpotifyAuthCallback();
renderSpotifyAuth(readStoredSpotifyAuth());
