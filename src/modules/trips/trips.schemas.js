const { optionalString } = require('../../shared/validation');

function validateTripIdParam(params) {
  if (!params.tripId) return 'Missing tripId.';
  return null;
}

function validateIngestBody(body) {
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    return 'Missing payload. Provide a `payload` object with trip details.';
  }
  if (!optionalString(body.source)) return 'source must be a string when provided.';
  if (body.metadata != null && (typeof body.metadata !== 'object' || Array.isArray(body.metadata))) {
    return 'metadata must be an object when provided.';
  }
  if (!optionalString(body.tripId)) return 'tripId must be a string when provided.';
  return null;
}

function validateReminderBody(body) {
  if (body.leadMinutes != null && !Number.isFinite(Number(body.leadMinutes))) return 'leadMinutes must be numeric when provided.';
  if (!optionalString(body.channel)) return 'channel must be a string when provided.';
  if (!optionalString(body.scheduledFor)) return 'scheduledFor must be a string when provided.';
  if (!optionalString(body.userId)) return 'userId must be a string when provided.';
  if (!optionalString(body.playlistUrl)) return 'playlistUrl must be a string when provided.';
  if (body.autoRefreshPlaylist != null && typeof body.autoRefreshPlaylist !== 'boolean') return 'autoRefreshPlaylist must be a boolean when provided.';
  return null;
}

function validateRefreshLoopBody(body) {
  if (body.horizonMinutes != null && !Number.isFinite(Number(body.horizonMinutes))) return 'horizonMinutes must be numeric when provided.';
  if (body.delayThresholdSeconds != null && !Number.isFinite(Number(body.delayThresholdSeconds))) return 'delayThresholdSeconds must be numeric when provided.';
  if (body.refreshPlaylist != null && typeof body.refreshPlaylist !== 'boolean') return 'refreshPlaylist must be a boolean when provided.';
  if (body.preferences != null && (typeof body.preferences !== 'object' || Array.isArray(body.preferences))) return 'preferences must be an object when provided.';
  if (!optionalString(body.userId)) return 'userId must be a string when provided.';
  return null;
}

module.exports = {
  validateTripIdParam,
  validateIngestBody,
  validateReminderBody,
  validateRefreshLoopBody
};
