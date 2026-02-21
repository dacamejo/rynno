const AUTH_CONFIG = Object.freeze({
  oauthStateTtlMs: 10 * 60 * 1000,
  defaultSpotifyScopes: 'playlist-modify-private playlist-modify-public user-read-private user-library-read'
});

module.exports = { AUTH_CONFIG };
