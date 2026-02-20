const express = require('express');
const { asyncHandler } = require('../../shared/errors');
const { requireInternalApiKey } = require('../../shared/http');

function createMetaRouter(controller) {
  const router = express.Router();
  router.get('/', controller.root);
  router.get('/health', controller.health);
  router.get('/share-target', controller.shareTarget);
  router.post('/share-target', controller.postShareTarget);
  router.get('/api/v1/reminders/:reminderId', asyncHandler(controller.reminder));
  router.post('/api/v1/reminders/dispatch-due', requireInternalApiKey(), asyncHandler(controller.dispatchDue));
  router.get('/api/trip-parser/contract', controller.contract);
  router.post('/api/trip-parser', asyncHandler(controller.tripParserProxy));
  return router;
}

module.exports = { createMetaRouter };
