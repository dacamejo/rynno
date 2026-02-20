const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { requireInternalApiKey } = require('../../shared/http');
const {
  validateTripIdParam,
  validateIngestBody,
  validateReminderBody,
  validateRefreshLoopBody
} = require('./trips.schemas');

function createTripsRouter(controller) {
  const router = express.Router();

  router.post('/api/v1/trips/ingest', validate({ body: validateIngestBody }), asyncHandler(controller.ingest));
  router.get('/api/v1/trips/:tripId/status', validate({ params: validateTripIdParam }), asyncHandler(controller.status));
  router.post('/api/v1/trips/:tripId/refresh', validate({ params: validateTripIdParam }), asyncHandler(controller.refresh));
  router.post('/api/v1/trips/:tripId/reminders', validate({ params: validateTripIdParam, body: validateReminderBody }), asyncHandler(controller.createReminder));
  router.post('/api/v1/trips/refresh-loop', requireInternalApiKey(), validate({ body: validateRefreshLoopBody }), asyncHandler(controller.refreshLoop));

  return router;
}

module.exports = { createTripsRouter };
