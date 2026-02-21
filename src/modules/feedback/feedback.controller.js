const { AppError } = require('../../shared/errors');

const SUPPORTED_FEEDBACK_EVENT_TYPES = new Set([
  'thumbs_up',
  'thumbs_down',
  'feedback_text',
  'playlist_regenerated',
  'parse_success',
  'parse_failure',
  'guardrail_failure',
  'track_skipped',
  'reminder_sent',
  'reminder_failed',
  'click_generate',
  'generate_success',
  'generate_failure',
  'open_spotify_click',
  'retry_generate'
]);

function createFeedbackController({ recordFeedbackEvent, listFeedbackEvents, getFeedbackDashboard }) {
  return {
    async createEvent(req, res) {
      const { eventType, userId = null, tripId = null, reminderId = null, playlistId = null, rating = null, feedbackText = null, outcome = null, context = {}, occurredAt = new Date().toISOString() } = req.body;
      if (!eventType || !SUPPORTED_FEEDBACK_EVENT_TYPES.has(eventType)) {
        throw new AppError('Unsupported eventType.', { statusCode: 400, code: 'UNSUPPORTED_EVENT_TYPE', details: { supportedEventTypes: [...SUPPORTED_FEEDBACK_EVENT_TYPES] } });
      }

      const event = await recordFeedbackEvent({ eventType, userId, tripId, reminderId, playlistId, rating, feedbackText, outcome, context: context && typeof context === 'object' ? context : {}, occurredAt });
      return res.status(201).json({ status: 'recorded', event });
    },

    async listEvents(req, res) {
      const events = await listFeedbackEvents({ userId: req.query.userId || null, tripId: req.query.tripId || null, eventType: req.query.eventType || null, limit: req.query.limit || 100 });
      return res.json({ count: events.length, events });
    },

    async dashboard(req, res) {
      const dashboard = await getFeedbackDashboard({ days: req.query.days || 30, userId: req.query.userId || null });
      return res.json(dashboard);
    }
  };
}

module.exports = { createFeedbackController, SUPPORTED_FEEDBACK_EVENT_TYPES };
