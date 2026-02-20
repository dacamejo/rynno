const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');

function createPlaylistsRouter(controller) {
  const router = express.Router();

  router.post(
    '/api/v1/playlists/generate',
    validate({
      body: (b) => {
        if (!b.trip) return 'Trip data is required to build a playlist.';
        if (!b.spotify || (!b.spotify.accessToken && !b.spotify.refreshToken)) {
          return 'Spotify accessToken or refreshToken is required to generate playlists.';
        }
        return null;
      }
    }),
    asyncHandler(controller.generate)
  );

  return router;
}

module.exports = { createPlaylistsRouter };
