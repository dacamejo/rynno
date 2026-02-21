const { AUTH_CONFIG } = require('./auth.config');
const { createAuthService, buildReauthSignal } = require('./auth.service');
const { createAuthStateTokenService } = require('./auth-state-token');

function getBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function buildSpotifyRedirectUri(requestBaseUrl) {
  return `${requestBaseUrl}/auth/spotify/callback`;
}

function resolveSafeReturnTo({ requestBaseUrl, candidate }) {
  if (!candidate) return `${requestBaseUrl}/`;

  try {
    const parsed = new URL(candidate, requestBaseUrl);
    const baseOrigin = new URL(requestBaseUrl).origin;
    if (parsed.origin !== baseOrigin) return `${requestBaseUrl}/`;
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `${requestBaseUrl}/`;
  }
}

function resolveAuthStateSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.SPOTIFY_CLIENT_SECRET || process.env.INTERNAL_API_KEY || 'local-dev-oauth-state-secret';
}

function createAuthController(deps) {
  const stateSecret = resolveAuthStateSecret();

  const authService = createAuthService({
    ...deps,
    authConfig: AUTH_CONFIG,
    buildRedirectUri: buildSpotifyRedirectUri,
    resolveReturnTo: resolveSafeReturnTo,
    stateTokenService: createAuthStateTokenService({ secret: stateSecret, ttlMs: AUTH_CONFIG.oauthStateTtlMs })
  });

  return {
    spotifyAuth(req, res) {
      const redirectUrl = authService.createSpotifyAuthorizeUrl({
        query: req.query,
        requestBaseUrl: getBaseUrl(req)
      });
      return res.redirect(redirectUrl);
    },

    async spotifyCallback(req, res) {
      const redirectUrl = await authService.completeSpotifyCallback({
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
        requestBaseUrl: getBaseUrl(req)
      });
      return res.redirect(redirectUrl);
    },

    async refreshSpotify(req, res) {
      const responseDto = await authService.refreshSpotifyToken({ userId: req.body.userId });
      return res.json(responseDto);
    },

    async getSpotifyTokenMetadata(req, res) {
      const responseDto = await authService.getSpotifyTokenMetadata({ userId: req.params.userId });
      return res.json(responseDto);
    }
  };
}

module.exports = { createAuthController, getBaseUrl, buildReauthSignal };
