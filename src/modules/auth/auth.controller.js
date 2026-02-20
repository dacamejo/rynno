const crypto = require('crypto');
const { getErrorCauseDetails, AppError, NotFoundError } = require('../../shared/errors');

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SPOTIFY_SCOPES = 'playlist-modify-private playlist-modify-public user-read-private user-library-read';
const authStateStore = new Map();

function getBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function buildSpotifyRedirectUri(req) {
  return `${getBaseUrl(req)}/auth/spotify/callback`;
}

function resolveSafeReturnTo(req) {
  const baseUrl = getBaseUrl(req);
  const candidate = req.query.returnTo;
  if (!candidate) return `${baseUrl}/`;

  try {
    const parsed = new URL(candidate, baseUrl);
    const baseOrigin = new URL(baseUrl).origin;
    if (parsed.origin !== baseOrigin) return `${baseUrl}/`;
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `${baseUrl}/`;
  }
}

function putAuthState(record) {
  const state = crypto.randomBytes(24).toString('hex');
  authStateStore.set(state, { ...record, createdAt: Date.now() });
  return state;
}

function consumeAuthState(state) {
  const record = authStateStore.get(state);
  if (!record) return null;
  authStateStore.delete(state);
  if (Date.now() - record.createdAt > AUTH_STATE_TTL_MS) return null;
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
  return { required: true, userId, reason, nextStep: 'Re-authenticate via GET /auth/spotify?userId=<id>' };
}

function createAuthController({ spotifyClient, upsertUser, saveOAuthToken, getOAuthToken }) {
  return {
    spotifyAuth(req, res) {
      cleanupExpiredAuthStates();
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        throw new AppError('Missing SPOTIFY_CLIENT_ID environment variable.', { statusCode: 500, code: 'CONFIG_ERROR' });
      }

      const userId = resolveUserId(req.query);
      const tripId = req.query.tripId || null;
      const scopes = req.query.scopes || process.env.SPOTIFY_SCOPES || DEFAULT_SPOTIFY_SCOPES;
      const returnTo = resolveSafeReturnTo(req);
      const state = putAuthState({ userId, tripId, returnTo });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: buildSpotifyRedirectUri(req),
        scope: scopes,
        state,
        show_dialog: req.query.showDialog === 'true' ? 'true' : 'false'
      });

      return res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
    },

    async spotifyCallback(req, res) {
      const { code, state, error } = req.query;
      if (error) throw new AppError(`Spotify authorization failed: ${error}`, { statusCode: 400, code: 'SPOTIFY_AUTH_ERROR' });
      if (!state) throw new AppError('Missing OAuth state.', { statusCode: 400, code: 'MISSING_STATE' });

      const authRecord = consumeAuthState(state);
      if (!authRecord) throw new AppError('Invalid or expired OAuth state.', { statusCode: 400, code: 'INVALID_STATE' });

      try {
        const tokenResponse = await spotifyClient.exchangeAuthorizationCode({ code, redirectUri: buildSpotifyRedirectUri(req) });
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
            displayName: profile.display_name || null,
            avatarUrl: profile.images?.[0]?.url || null,
            email: profile.email || null
          }
        });
        const callbackParams = new URLSearchParams({
          spotifyAuth: 'connected',
          userId: authRecord.userId,
          spotifyUserId: profile.id,
          expiresAt,
          displayName: profile.display_name || '',
          avatarUrl: profile.images?.[0]?.url || ''
        });
        if (authRecord.tripId) callbackParams.set('tripId', authRecord.tripId);

        const returnToUrl = new URL(authRecord.returnTo || `${getBaseUrl(req)}/`);
        returnToUrl.searchParams.set('spotifyAuth', callbackParams.get('spotifyAuth'));
        returnToUrl.searchParams.set('userId', callbackParams.get('userId'));
        returnToUrl.searchParams.set('spotifyUserId', callbackParams.get('spotifyUserId'));
        returnToUrl.searchParams.set('expiresAt', callbackParams.get('expiresAt'));
        if (callbackParams.get('displayName')) returnToUrl.searchParams.set('displayName', callbackParams.get('displayName'));
        if (callbackParams.get('avatarUrl')) returnToUrl.searchParams.set('avatarUrl', callbackParams.get('avatarUrl'));
        if (authRecord.tripId) returnToUrl.searchParams.set('tripId', authRecord.tripId);

        return res.redirect(returnToUrl.toString());
      } catch (callbackError) {
        throw new AppError('Unable to finish Spotify authorization flow.', {
          statusCode: 500,
          code: 'SPOTIFY_CALLBACK_FAILED',
          details: getErrorCauseDetails(callbackError)
        });
      }
    },

    async refreshSpotify(req, res) {
      const userId = req.body.userId;
      const tokenEntry = await getOAuthToken(userId, 'spotify');
      if (!tokenEntry) throw new NotFoundError('Spotify token not found for user.');
      if (!tokenEntry.refreshToken) {
        throw new AppError('Missing refresh token for user.', {
          statusCode: 400,
          code: 'MISSING_REFRESH_TOKEN',
          details: { reauth: buildReauthSignal({ userId, reason: 'missing_refresh_token' }) }
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
      } catch (error) {
        const details = getErrorCauseDetails(error);
        const needsReauth = /invalid_grant/i.test(details);
        throw new AppError('Unable to refresh Spotify token.', {
          statusCode: 400,
          code: 'SPOTIFY_REFRESH_FAILED',
          details: { details, reauth: needsReauth ? buildReauthSignal({ userId, reason: 'invalid_grant' }) : null }
        });
      }
    },

    async getSpotifyTokenMetadata(req, res) {
      const tokenEntry = await getOAuthToken(req.params.userId, 'spotify');
      if (!tokenEntry) throw new NotFoundError('Token metadata not found.');

      return res.json({
        userId: tokenEntry.userId,
        provider: tokenEntry.provider,
        scope: tokenEntry.scope,
        tokenType: tokenEntry.tokenType,
        expiresAt: tokenEntry.expiresAt,
        lastRefreshedAt: tokenEntry.lastRefreshedAt,
        metadata: tokenEntry.metadata
      });
    }
  };
}

module.exports = { createAuthController, getBaseUrl, buildReauthSignal };
