const { optionalString } = require('../../shared/validation');

function validateSpotifyAuthQuery(query) {
  if (!optionalString(query.userId) || !optionalString(query.user_id)) return 'userId must be a string when provided.';
  if (!optionalString(query.tripId)) return 'tripId must be a string when provided.';
  if (!optionalString(query.scopes)) return 'scopes must be a string when provided.';
  if (!optionalString(query.showDialog)) return 'showDialog must be a string when provided.';
  if (!optionalString(query.returnTo)) return 'returnTo must be a string when provided.';
  return null;
}

function validateSpotifyCallbackQuery(query) {
  if (!optionalString(query.code)) return 'code must be a string when provided.';
  if (!optionalString(query.state)) return 'state must be a string when provided.';
  if (!optionalString(query.error)) return 'error must be a string when provided.';
  return null;
}

function validateRefreshBody(body) {
  if (!optionalString(body.userId) || !body.userId) return 'Missing userId.';
  return null;
}

function validateTokenParams(params) {
  if (!params.userId) return 'Missing userId param.';
  return null;
}

module.exports = {
  validateSpotifyAuthQuery,
  validateSpotifyCallbackQuery,
  validateRefreshBody,
  validateTokenParams
};
