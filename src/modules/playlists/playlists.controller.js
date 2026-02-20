const { AppError, getErrorCauseDetails } = require('../../shared/errors');

function createPlaylistsController({ generatePlaylist, safeRecordFeedbackEvent }) {
  return {
    async generate(req, res) {
      const { trip, preferences = {}, spotify = {} } = req.body;
      try {
        const playlist = await generatePlaylist({ trip, preferences, spotify });

        const failedGuardrailAttempts = (playlist.guardrailAttempts || []).filter((attempt) => !attempt.pass);
        if (failedGuardrailAttempts.length) {
          await safeRecordFeedbackEvent({
            eventType: 'guardrail_failure',
            userId: spotify.userId || trip?.metadata?.userId || null,
            tripId: trip.tripId || null,
            playlistId: playlist.playlistId || null,
            outcome: 'retry_recovered',
            context: { failedAttempts: failedGuardrailAttempts.length, reasons: failedGuardrailAttempts.flatMap((attempt) => attempt.reasons || []).slice(0, 8) }
          });
        }

        if (req.body?.isRegeneration || req.body?.regeneratedFromPlaylistId) {
          await safeRecordFeedbackEvent({
            eventType: 'playlist_regenerated',
            userId: spotify.userId || trip?.metadata?.userId || null,
            tripId: trip.tripId || null,
            playlistId: playlist.playlistId || null,
            outcome: 'created',
            context: { regeneratedFromPlaylistId: req.body?.regeneratedFromPlaylistId || null, tags: preferences?.tags || [] }
          });
        }

        return res.status(200).json(playlist);
      } catch (error) {
        throw new AppError('Playlist generation failed.', { statusCode: 500, code: 'PLAYLIST_GENERATION_FAILED', details: getErrorCauseDetails(error) });
      }
    }
  };
}

module.exports = { createPlaylistsController };
