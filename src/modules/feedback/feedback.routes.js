const express = require('express');
const { asyncHandler } = require('../../shared/errors');

function createFeedbackRouter(controller) {
  const router = express.Router();
  router.post('/api/v1/feedback/events', asyncHandler(controller.createEvent));
  router.get('/api/v1/feedback/events', asyncHandler(controller.listEvents));
  router.get('/api/v1/feedback/dashboard', asyncHandler(controller.dashboard));
  return router;
}

module.exports = { createFeedbackRouter };
