const express = require('express');
const path = require('path');
const { requestContext } = require('./middleware/requestContext');
const logger = require('../shared/logger');
const { errorHandler, getErrorCauseDetails } = require('../shared/errors');
const { createAuthController } = require('../modules/auth/auth.controller');
const { createAuthWebRouter, createAuthApiRouter } = require('../modules/auth/auth.routes');
const { createTripsController } = require('../modules/trips/trips.controller');
const { createTripsRouter } = require('../modules/trips/trips.routes');
const { createPlaylistsController } = require('../modules/playlists/playlists.controller');
const { createPlaylistsRouter } = require('../modules/playlists/playlists.routes');
const { createFeedbackController } = require('../modules/feedback/feedback.controller');
const { createFeedbackRouter } = require('../modules/feedback/feedback.routes');
const { createMetaController } = require('../modules/meta/meta.controller');
const { createMetaRouter } = require('../modules/meta/meta.routes');
const { runAdapter } = require('../tripParser');
const { generatePlaylist } = require('../../services/playlistBuilder');
const spotifyClient = require('../../services/spotifyClient');
const dbModule = require('../db');
const reminderScheduler = require('../../services/reminderScheduler');

function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(requestContext({ logger }));

  async function safeRecordFeedbackEvent(payload) {
    try {
      await dbModule.recordFeedbackEvent(payload);
    } catch (error) {
      logger.warn('Unable to persist feedback event', { eventType: payload?.eventType, error: getErrorCauseDetails(error) });
    }
  }

  const authController = createAuthController({
    spotifyClient,
    upsertUser: dbModule.upsertUser,
    saveOAuthToken: dbModule.saveOAuthToken,
    getOAuthToken: dbModule.getOAuthToken
  });

  const tripsController = createTripsController({
    runAdapter,
    db: {
      saveTripEntry: dbModule.saveTripEntry,
      getTripEntry: dbModule.getTripEntry,
      createReminder: dbModule.createReminder,
      listTripsForRefresh: dbModule.listTripsForRefresh,
      safeRecordFeedbackEvent
    },
    reminderScheduler,
    generatePlaylist,
    getOAuthToken: dbModule.getOAuthToken
  });

  const playlistsController = createPlaylistsController({ generatePlaylist, safeRecordFeedbackEvent });
  const feedbackController = createFeedbackController({
    recordFeedbackEvent: dbModule.recordFeedbackEvent,
    listFeedbackEvents: dbModule.listFeedbackEvents,
    getFeedbackDashboard: dbModule.getFeedbackDashboard
  });

  const metaController = createMetaController({
    getReminder: dbModule.getReminder,
    dispatchDueReminders: reminderScheduler.dispatchDueReminders,
    listDueReminders: dbModule.listDueReminders,
    getTripEntry: dbModule.getTripEntry,
    markReminderStatus: dbModule.markReminderStatus,
    safeRecordFeedbackEvent,
    getBaseUrl: (req) => process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`
  });

  app.use(createMetaRouter(metaController));
  app.use('/auth', createAuthWebRouter(authController));
  app.use(createAuthApiRouter(authController));
  app.use(createTripsRouter(tripsController));
  app.use(createPlaylistsRouter(playlistsController));
  app.use(createFeedbackRouter(feedbackController));

  app.use(errorHandler({ logger }));

  return app;
}

module.exports = { createServer };
