const swStatus = document.getElementById('sw-status');
const spotifyStatus = document.getElementById('spotify-status');
const simulateShareButton = document.getElementById('simulate-share');
const loaderCard = document.getElementById('loader-card');
const tripReviewCard = document.getElementById('trip-review');
const playlistPanel = document.getElementById('playlist-panel');
const tripSummary = document.getElementById('trip-summary');
const tagChipsContainer = document.getElementById('tag-chips');
const tripActionStatus = document.getElementById('trip-action-status');
const regeneratePlaylistButton = document.getElementById('regenerate-playlist');
const scheduleReminderButton = document.getElementById('schedule-reminder');
const openOauthButton = document.getElementById('open-oauth');
const spotifyUserIdInput = document.getElementById('spotify-user-id');

const TAGS = ['Solo', 'Couple', 'Family', 'Celebration', 'Surprise'];
const selectedTags = new Set(['Solo']);
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

function renderTags() {
  tagChipsContainer.innerHTML = '';
  TAGS.forEach((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = tag;
    chip.setAttribute('aria-pressed', String(selectedTags.has(tag)));
    chip.addEventListener('click', () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }

      if (!selectedTags.size) {
        selectedTags.add('Surprise');
      }

      renderTags();
      tripActionStatus.textContent = `Updated tags: ${Array.from(selectedTags).join(', ')}`;
    });

    tagChipsContainer.appendChild(chip);
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
    tripActionStatus.textContent = `Trip ready (${activeTripId}). Adjust tags and regenerate.`;
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
    tripActionStatus.textContent = `Playlist inputs refreshed (${refresh.status}) with tags: ${Array.from(selectedTags).join(', ')}.`;
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
  window.open(`/auth/spotify?userId=${encodeURIComponent(userId)}`, '_blank', 'noopener');
  spotifyStatus.textContent = `Spotify auth: OAuth opened for ${userId}`;
  spotifyStatus.classList.add('status-good');
}

simulateShareButton.addEventListener('click', simulateShareIngest);
regeneratePlaylistButton.addEventListener('click', regeneratePlaylist);
scheduleReminderButton.addEventListener('click', scheduleReminder);
openOauthButton.addEventListener('click', openOauth);

renderTags();
setupServiceWorker();
