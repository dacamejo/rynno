const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { requireInternalApiKey } = require('../../shared/http');
const {
  validateSpotifyAuthQuery,
  validateSpotifyCallbackQuery,
  validateRefreshBody,
  validateTokenParams
} = require('./auth.schemas');

function createAuthWebRouter(controller) {
  const router = express.Router();
  router.get('/spotify', validate({ query: validateSpotifyAuthQuery }), asyncHandler(controller.spotifyAuth));
  router.get('/spotify/callback', validate({ query: validateSpotifyCallbackQuery }), asyncHandler(controller.spotifyCallback));
  return router;
}

function createAuthApiRouter(controller) {
  const router = express.Router();
  router.post('/api/spotify/refresh', requireInternalApiKey(), validate({ body: validateRefreshBody }), asyncHandler(controller.refreshSpotify));
  router.get('/api/spotify/tokens/:userId', validate({ params: validateTokenParams }), asyncHandler(controller.getSpotifyTokenMetadata));
  return router;
}

module.exports = { createAuthWebRouter, createAuthApiRouter };
