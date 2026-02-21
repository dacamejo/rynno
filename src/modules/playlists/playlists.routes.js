const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { createIdempotencyMiddleware } = require('../../shared/http');
const { validateGeneratePlaylistBody } = require('./playlists.schemas');

function createPlaylistsRouter(controller) {
  const router = express.Router();

  const idempotencyMiddleware = createIdempotencyMiddleware();
  router.post('/api/v1/playlists/generate', idempotencyMiddleware, validate({ body: validateGeneratePlaylistBody }), asyncHandler(controller.generate));
  return router;
}

module.exports = { createPlaylistsRouter };
