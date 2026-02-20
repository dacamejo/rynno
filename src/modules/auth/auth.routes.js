const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate, optionalString } = require('../../shared/validation');
const { requireInternalApiKey } = require('../../shared/http');

function createAuthWebRouter(controller) {
  const router = express.Router();
  router.get('/spotify', asyncHandler(controller.spotifyAuth));
  router.get('/spotify/callback', asyncHandler(controller.spotifyCallback));
  return router;
}

function createAuthApiRouter(controller) {
  const router = express.Router();
  router.post(
    '/api/spotify/refresh',
    requireInternalApiKey(),
    validate({ body: (body) => (!optionalString(body.userId) || !body.userId ? 'Missing userId.' : null) }),
    asyncHandler(controller.refreshSpotify)
  );
  router.get('/api/spotify/tokens/:userId', validate({ params: (p) => (!p.userId ? 'Missing userId param.' : null) }), asyncHandler(controller.getSpotifyTokenMetadata));
  return router;
}

module.exports = { createAuthWebRouter, createAuthApiRouter };
