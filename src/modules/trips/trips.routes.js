const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { requireInternalApiKey } = require('../../shared/http');

function createTripsRouter(controller) {
  const router = express.Router();

  router.post('/api/v1/trips/ingest', validate({ body: (b) => (!b.payload || typeof b.payload !== 'object' ? 'Missing payload. Provide a `payload` object with trip details.' : null) }), asyncHandler(controller.ingest));
  router.get('/api/v1/trips/:tripId/status', validate({ params: (p) => (!p.tripId ? 'Missing tripId.' : null) }), asyncHandler(controller.status));
  router.post('/api/v1/trips/:tripId/refresh', validate({ params: (p) => (!p.tripId ? 'Missing tripId.' : null) }), asyncHandler(controller.refresh));
  router.post('/api/v1/trips/:tripId/reminders', validate({ params: (p) => (!p.tripId ? 'Missing tripId.' : null) }), asyncHandler(controller.createReminder));
  router.post('/api/v1/trips/refresh-loop', requireInternalApiKey(), asyncHandler(controller.refreshLoop));

  return router;
}

module.exports = { createTripsRouter };
