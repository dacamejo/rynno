const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthController } = require('../src/modules/auth/auth.controller');

function createReq({ query = {}, host = 'example.com', protocol = 'https' } = {}) {
  return {
    query,
    protocol,
    get(header) {
      if (header === 'host') return host;
      return null;
    }
  };
}

function createRes() {
  return {
    redirectedTo: null,
    redirect(url) {
      this.redirectedTo = url;
      return this;
    }
  };
}

test('spotify auth callback redirects back to app instead of returning raw JSON payload', async () => {

  const previousClientId = process.env.SPOTIFY_CLIENT_ID;
  process.env.SPOTIFY_CLIENT_ID = 'client-id';
  const spotifyClient = {
    async exchangeAuthorizationCode() {
      return {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        scope: 'playlist-modify-private',
        tokenType: 'Bearer'
      };
    },
    async getUserProfile() {
      return {
        id: 'spotify-user-123',
        display_name: 'Music Rider',
        email: 'rider@example.com',
        country: 'CH',
        images: [{ url: 'https://image.cdn/avatar.jpg' }]
      };
    }
  };

  const controller = createAuthController({
    spotifyClient,
    upsertUser: async () => {},
    saveOAuthToken: async () => {},
    getOAuthToken: async () => null
  });

  try {
  const authReq = createReq({
    query: { userId: 'user-1', returnTo: 'https://example.com/?view=settings' }
  });
  const authRes = createRes();
  controller.spotifyAuth(authReq, authRes);

  assert.ok(authRes.redirectedTo);
  const spotifyUrl = new URL(authRes.redirectedTo);
  const state = spotifyUrl.searchParams.get('state');
  assert.ok(state);

  const callbackReq = createReq({
    query: { code: 'auth-code', state }
  });
  const callbackRes = createRes();
  await controller.spotifyCallback(callbackReq, callbackRes);

  assert.ok(callbackRes.redirectedTo);
  const redirectedBack = new URL(callbackRes.redirectedTo);
  assert.equal(redirectedBack.origin, 'https://example.com');
  assert.equal(redirectedBack.searchParams.get('spotifyAuth'), 'connected');
  assert.equal(redirectedBack.searchParams.get('userId'), 'user-1');
  assert.equal(redirectedBack.searchParams.get('spotifyUserId'), 'spotify-user-123');
  assert.equal(redirectedBack.searchParams.get('displayName'), 'Music Rider');
  } finally {
    if (previousClientId == null) delete process.env.SPOTIFY_CLIENT_ID;
    else process.env.SPOTIFY_CLIENT_ID = previousClientId;
  }
});

