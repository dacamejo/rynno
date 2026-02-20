function validateGeneratePlaylistBody(body) {
  if (!body.trip || typeof body.trip !== 'object' || Array.isArray(body.trip)) {
    return 'Trip data is required to build a playlist.';
  }

  if (!body.spotify || typeof body.spotify !== 'object' || Array.isArray(body.spotify)) {
    return 'Spotify accessToken or refreshToken is required to generate playlists.';
  }

  if (!body.spotify.accessToken && !body.spotify.refreshToken) {
    return 'Spotify accessToken or refreshToken is required to generate playlists.';
  }

  if (body.preferences != null && (typeof body.preferences !== 'object' || Array.isArray(body.preferences))) {
    return 'preferences must be an object when provided.';
  }

  return null;
}

module.exports = { validateGeneratePlaylistBody };
