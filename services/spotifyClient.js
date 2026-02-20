const axios = require('axios');

const ACCOUNTS_BASE = 'https://accounts.spotify.com/api';
const API_BASE = 'https://api.spotify.com/v1';

function buildAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
}

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify client ID / secret for refresh flow.');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await axios.post(`${ACCOUNTS_BASE}/token`, body.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 10000
  });

  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in
  };
}

async function getUserProfile(accessToken) {
  const response = await axios.get(`${API_BASE}/me`, {
    headers: buildAuthHeaders(accessToken),
    timeout: 10000
  });
  return response.data;
}

async function getRecommendations(accessToken, params = {}) {
  const response = await axios.get(`${API_BASE}/recommendations`, {
    headers: buildAuthHeaders(accessToken),
    params,
    timeout: 10000
  });
  return response.data;
}

async function getAudioFeatures(accessToken, trackIds = []) {
  if (!trackIds.length) {
    return [];
  }
  const MAX_BATCH = 100;
  const chunks = [];
  for (let i = 0; i < trackIds.length; i += MAX_BATCH) {
    chunks.push(trackIds.slice(i, i + MAX_BATCH));
  }

  const features = [];
  for (const chunk of chunks) {
    const response = await axios.get(`${API_BASE}/audio-features`, {
      headers: buildAuthHeaders(accessToken),
      params: { ids: chunk.join(',') },
      timeout: 10000
    });
    features.push(...response.data.audio_features.filter(Boolean));
  }

  return features;
}

async function createPlaylist(accessToken, userId, { name, description, isPublic = false }) {
  const response = await axios.post(
    `${API_BASE}/users/${encodeURIComponent(userId)}/playlists`,
    {
      name,
      description,
      public: isPublic
    },
    {
      headers: buildAuthHeaders(accessToken),
      timeout: 10000
    }
  );
  return response.data;
}

async function addTracksToPlaylist(accessToken, playlistId, uris = []) {
  if (!uris.length) {
    return;
  }
  const response = await axios.post(
    `${API_BASE}/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { uris },
    {
      headers: buildAuthHeaders(accessToken),
      timeout: 10000
    }
  );
  return response.data;
}

module.exports = {
  refreshAccessToken,
  getUserProfile,
  getRecommendations,
  getAudioFeatures,
  createPlaylist,
  addTracksToPlaylist
};
