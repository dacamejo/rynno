const crypto = require('crypto');
const { AppError, NotFoundError, getErrorCauseDetails } = require('../../shared/errors');

function resolveUserId(query = {}) {
  return query.userId || query.user_id || crypto.randomUUID();
}

function buildReauthSignal({ userId, reason }) {
  return { required: true, userId, reason, nextStep: 'Re-authenticate via GET /auth/spotify?userId=<id>' };
}

function createAuthService({ spotifyClient, upsertUser, saveOAuthToken, getOAuthToken, buildRedirectUri, resolveReturnTo, stateTokenService, authConfig }) {
  return {
    createSpotifyAuthorizeUrl({ query, requestBaseUrl }) {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        throw new AppError('Missing SPOTIFY_CLIENT_ID environment variable.', { statusCode: 500, code: 'CONFIG_ERROR' });
      }

      const userId = resolveUserId(query);
      const tripId = query.tripId || null;
      const scopes = query.scopes || process.env.SPOTIFY_SCOPES || authConfig.defaultSpotifyScopes;
      const returnTo = resolveReturnTo({ requestBaseUrl, candidate: query.returnTo });
      const state = stateTokenService.issue({ userId, tripId, returnTo });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: buildRedirectUri(requestBaseUrl),
        scope: scopes,
        state,
        show_dialog: query.showDialog === 'true' ? 'true' : 'false'
      });

      return `https://accounts.spotify.com/authorize?${params.toString()}`;
    },

    async completeSpotifyCallback({ code, state, error, requestBaseUrl }) {
      if (error) throw new AppError(`Spotify authorization failed: ${error}`, { statusCode: 400, code: 'SPOTIFY_AUTH_ERROR' });
      if (!state) throw new AppError('Missing OAuth state.', { statusCode: 400, code: 'MISSING_STATE' });

      const authRecord = stateTokenService.consume(state);
      if (!authRecord) throw new AppError('Invalid or expired OAuth state.', { statusCode: 400, code: 'INVALID_STATE' });

      try {
        const tokenResponse = await spotifyClient.exchangeAuthorizationCode({ code, redirectUri: buildRedirectUri(requestBaseUrl) });
        const profile = await spotifyClient.getUserProfile(tokenResponse.accessToken);

        const user = await upsertUser({
          userId: authRecord.userId,
          email: profile.email || null,
          spotifyUserId: profile.id,
          locale: profile.country || null
        });
        const resolvedUserId = user?.user_id || user?.userId || authRecord.userId;

        const expiresAt = new Date(Date.now() + (tokenResponse.expiresIn || 3600) * 1000).toISOString();
        await saveOAuthToken({
          userId: resolvedUserId,
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

        const returnToUrl = new URL(authRecord.returnTo || `${requestBaseUrl}/`);
        returnToUrl.searchParams.set('spotifyAuth', 'connected');
        returnToUrl.searchParams.set('userId', resolvedUserId);
        returnToUrl.searchParams.set('spotifyUserId', profile.id);
        returnToUrl.searchParams.set('expiresAt', expiresAt);
        if (profile.display_name) returnToUrl.searchParams.set('displayName', profile.display_name);
        if (profile.images?.[0]?.url) returnToUrl.searchParams.set('avatarUrl', profile.images[0].url);
        if (authRecord.tripId) returnToUrl.searchParams.set('tripId', authRecord.tripId);

        return returnToUrl.toString();
      } catch (callbackError) {
        throw new AppError('Unable to finish Spotify authorization flow.', {
          statusCode: 500,
          code: 'SPOTIFY_CALLBACK_FAILED',
          details: getErrorCauseDetails(callbackError)
        });
      }
    },

    async refreshSpotifyToken({ userId }) {
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

        return { status: 'refreshed', userId, expiresAt };
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

    async getSpotifyTokenMetadata({ userId }) {
      const tokenEntry = await getOAuthToken(userId, 'spotify');
      if (!tokenEntry) throw new NotFoundError('Token metadata not found.');

      return {
        userId: tokenEntry.userId,
        provider: tokenEntry.provider,
        scope: tokenEntry.scope,
        tokenType: tokenEntry.tokenType,
        expiresAt: tokenEntry.expiresAt,
        lastRefreshedAt: tokenEntry.lastRefreshedAt,
        metadata: tokenEntry.metadata
      };
    }
  };
}

module.exports = { createAuthService, buildReauthSignal };
