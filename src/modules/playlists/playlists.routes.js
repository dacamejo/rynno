const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { validateGeneratePlaylistBody } = require('./playlists.schemas');

function createPlaylistsRouter(controller) {
  const router = express.Router();
  router.post('/api/v1/playlists/generate', validate({ body: validateGeneratePlaylistBody }), asyncHandler(controller.generate));
  return router;
}

module.exports = { createPlaylistsRouter };
