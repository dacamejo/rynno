const swStatus = document.getElementById('sw-status');
const baseUrlNode = document.getElementById('base-url');
const diagnosticsOutput = document.getElementById('diagnostics-output');
const tripOutput = document.getElementById('trip-output');
const spotifyOutput = document.getElementById('spotify-output');
const playlistOutput = document.getElementById('playlist-output');

const tripSource = document.getElementById('trip-source');
const tripIdInput = document.getElementById('trip-id');
const tripBodyInput = document.getElementById('trip-body');

const spotifyUserIdInput = document.getElementById('spotify-user-id');
const spotifyTripIdInput = document.getElementById('spotify-trip-id');

const playlistBodyInput = document.getElementById('playlist-body');

const defaultTripBody = {
  source: 'manual',
  metadata: {
    tester: 'feature-ui',
    flow: 'manual_test',
    capturedAt: new Date().toISOString()
  },
  payload: {
    sharedTitle: 'Basel SBB → Zürich HB',
    sharedText: 'Leave around 18:10, one transfer in Olten',
    sharedUrl: 'https://www.sbb.ch/en'
  }
};

const defaultPlaylistBody = {
  trip: {
    tripId: 'replace-with-trip-id',
    route: {
      origin: 'Basel SBB',
      destination: 'Zürich HB'
    },
    timing: {
      departureTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      arrivalTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    }
  },
  preferences: {
    mood: 'focus',
    avoidExplicit: false
  },
  spotify: {
    accessToken: 'paste-access-token-or-use-refresh-token',
    refreshToken: ''
  }
};

function setOutput(node, payload, tone = 'ok') {
  node.className = tone;
  node.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

function getJson(textarea, fallback = {}) {
  const raw = textarea.value.trim();
  if (!raw) {
    return fallback;
  }
  return JSON.parse(raw);
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

function initDefaults() {
  baseUrlNode.textContent = window.location.origin;
  tripBodyInput.value = JSON.stringify(defaultTripBody, null, 2);
  playlistBodyInput.value = JSON.stringify(defaultPlaylistBody, null, 2);
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    swStatus.textContent = 'Service worker not supported in this browser.';
    swStatus.className = 'small warn';
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    swStatus.textContent = 'Service worker ready. Share Target flows can be tested at /share-target.';
    swStatus.className = 'small ok';
  } catch (error) {
    swStatus.textContent = `Service worker registration failed: ${error.message}`;
    swStatus.className = 'small error';
  }
}

async function runAction(action) {
  try {
    if (action === 'health') {
      setOutput(diagnosticsOutput, await requestJson('/health'));
      return;
    }

    if (action === 'contract') {
      setOutput(diagnosticsOutput, await requestJson('/api/trip-parser/contract'));
      return;
    }

    if (action === 'ingest') {
      const body = getJson(tripBodyInput, defaultTripBody);
      body.source = tripSource.value || body.source || 'manual';

      const tripId = tripIdInput.value.trim();
      if (tripId) {
        body.tripId = tripId;
      }

      const result = await requestJson('/api/v1/trips/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!tripIdInput.value.trim() && result.tripId) {
        tripIdInput.value = result.tripId;
      }

      setOutput(tripOutput, result);
      return;
    }

    if (action === 'status') {
      const tripId = tripIdInput.value.trim();
      if (!tripId) {
        throw new Error('Trip ID required. Run ingest first or fill trip ID.');
      }
      setOutput(tripOutput, await requestJson(`/api/v1/trips/${encodeURIComponent(tripId)}/status`));
      return;
    }

    if (action === 'refresh') {
      const tripId = tripIdInput.value.trim();
      if (!tripId) {
        throw new Error('Trip ID required.');
      }
      setOutput(
        tripOutput,
        await requestJson(`/api/v1/trips/${encodeURIComponent(tripId)}/refresh`, { method: 'POST' })
      );
      return;
    }

    if (action === 'proxy-parse') {
      const body = getJson(tripBodyInput, defaultTripBody);
      setOutput(
        tripOutput,
        await requestJson('/api/trip-parser?retries=1', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      );
      return;
    }

    if (action === 'oauth-link') {
      const userId = spotifyUserIdInput.value.trim() || crypto.randomUUID();
      spotifyUserIdInput.value = userId;
      const tripId = spotifyTripIdInput.value.trim();
      const query = new URLSearchParams({ userId });
      if (tripId) {
        query.set('tripId', tripId);
      }
      const oauthUrl = `/auth/spotify?${query.toString()}`;
      window.open(oauthUrl, '_blank', 'noopener');
      setOutput(spotifyOutput, { message: 'OAuth window opened.', oauthUrl }, 'warn');
      return;
    }

    if (action === 'token-meta') {
      const userId = spotifyUserIdInput.value.trim();
      if (!userId) {
        throw new Error('User ID required.');
      }
      setOutput(spotifyOutput, await requestJson(`/api/spotify/tokens/${encodeURIComponent(userId)}`));
      return;
    }

    if (action === 'refresh-token') {
      const userId = spotifyUserIdInput.value.trim();
      if (!userId) {
        throw new Error('User ID required.');
      }

      setOutput(
        spotifyOutput,
        await requestJson('/api/spotify/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId })
        })
      );
      return;
    }

    if (action === 'playlist') {
      const body = getJson(playlistBodyInput, defaultPlaylistBody);
      setOutput(
        playlistOutput,
        await requestJson('/api/v1/playlists/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      );
    }
  } catch (error) {
    const nodeByAction = {
      health: diagnosticsOutput,
      contract: diagnosticsOutput,
      ingest: tripOutput,
      status: tripOutput,
      refresh: tripOutput,
      'proxy-parse': tripOutput,
      'oauth-link': spotifyOutput,
      'token-meta': spotifyOutput,
      'refresh-token': spotifyOutput,
      playlist: playlistOutput
    };

    setOutput(nodeByAction[action] || diagnosticsOutput, error.message, 'error');
  }
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    runAction(button.dataset.action);
  });
});

initDefaults();
setupServiceWorker();
