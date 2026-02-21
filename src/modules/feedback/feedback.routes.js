const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { validate } = require('../../shared/validation');
const { createIdempotencyMiddleware } = require('../../shared/http');
const {
  validateCreateEventBody,
  validateListEventsQuery,
  validateDashboardQuery
} = require('./feedback.schemas');

function createFeedbackRouter(controller) {
  const router = express.Router();

  const idempotencyMiddleware = createIdempotencyMiddleware();
  router.post('/api/v1/feedback/events', idempotencyMiddleware, validate({ body: validateCreateEventBody }), asyncHandler(controller.createEvent));
  router.get('/api/v1/feedback/events', validate({ query: validateListEventsQuery }), asyncHandler(controller.listEvents));
  router.get('/api/v1/feedback/dashboard', validate({ query: validateDashboardQuery }), asyncHandler(controller.dashboard));
  return router;
}

module.exports = { createFeedbackRouter };
