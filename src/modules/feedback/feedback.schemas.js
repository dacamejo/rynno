const { optionalString } = require('../../shared/validation');
const { SUPPORTED_FEEDBACK_EVENT_TYPES } = require('./feedback.controller');

function validateCreateEventBody(body) {
  if (!body.eventType || !SUPPORTED_FEEDBACK_EVENT_TYPES.has(body.eventType)) {
    return `Unsupported eventType. Supported values: ${[...SUPPORTED_FEEDBACK_EVENT_TYPES].join(', ')}`;
  }
  if (!optionalString(body.userId)) return 'userId must be a string when provided.';
  if (!optionalString(body.tripId)) return 'tripId must be a string when provided.';
  if (!optionalString(body.reminderId)) return 'reminderId must be a string when provided.';
  if (!optionalString(body.playlistId)) return 'playlistId must be a string when provided.';
  if (body.rating != null && !Number.isFinite(Number(body.rating))) return 'rating must be numeric when provided.';
  if (!optionalString(body.feedbackText)) return 'feedbackText must be a string when provided.';
  if (!optionalString(body.outcome)) return 'outcome must be a string when provided.';
  if (body.context != null && (typeof body.context !== 'object' || Array.isArray(body.context))) return 'context must be an object when provided.';
  if (!optionalString(body.occurredAt)) return 'occurredAt must be a string when provided.';
  return null;
}

function validateListEventsQuery(query) {
  if (!optionalString(query.userId)) return 'userId must be a string when provided.';
  if (!optionalString(query.tripId)) return 'tripId must be a string when provided.';
  if (!optionalString(query.eventType)) return 'eventType must be a string when provided.';
  if (query.limit != null && !Number.isFinite(Number(query.limit))) return 'limit must be numeric when provided.';
  return null;
}

function validateDashboardQuery(query) {
  if (query.days != null && !Number.isFinite(Number(query.days))) return 'days must be numeric when provided.';
  if (!optionalString(query.userId)) return 'userId must be a string when provided.';
  return null;
}

module.exports = {
  validateCreateEventBody,
  validateListEventsQuery,
  validateDashboardQuery
};
