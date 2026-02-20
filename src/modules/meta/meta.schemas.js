const { optionalString } = require('../../shared/validation');

function validateReminderParams(params) {
  if (!params.reminderId) return 'Missing reminderId.';
  return null;
}

function validateDispatchBody(body) {
  if (body.limit != null && !Number.isFinite(Number(body.limit))) return 'limit must be numeric when provided.';
  return null;
}

function validateTripParserQuery(query) {
  if (query.retries != null && !Number.isFinite(Number(query.retries))) return 'retries must be numeric when provided.';
  return null;
}

function validateTripParserBody(body) {
  if (body != null && typeof body !== 'object') return 'body must be an object.';
  if (!optionalString(body?.source)) return 'source must be a string when provided.';
  return null;
}

module.exports = {
  validateReminderParams,
  validateDispatchBody,
  validateTripParserQuery,
  validateTripParserBody
};
