const { AppError, getErrorCauseDetails } = require('../../shared/errors');

function createPlaylistsController({ generatePlaylist, safeRecordFeedbackEvent, getOAuthToken }) {
  return {
    async generate(req, res) {
      const { trip, preferences = {}, spotify = {} } = req.body;
      try {
        const spotifyContext = { ...spotify };
        if (!spotifyContext.accessToken && !spotifyContext.refreshToken && spotifyContext.userId) {
          const tokenEntry = await getOAuthToken(spotifyContext.userId, 'spotify');
          if (!tokenEntry) {
            throw new AppError('Spotify token not found for user.', { statusCode: 401, code: 'SPOTIFY_AUTH_REQUIRED' });
          }

          spotifyContext.accessToken = tokenEntry.accessToken || null;
          spotifyContext.refreshToken = tokenEntry.refreshToken || null;
        }

        const playlist = await generatePlaylist({ trip, preferences, spotify: spotifyContext });

        const failedGuardrailAttempts = (playlist.guardrailAttempts || []).filter((attempt) => !attempt.pass);
        if (failedGuardrailAttempts.length) {
          await safeRecordFeedbackEvent({
            eventType: 'guardrail_failure',
            userId: spotifyContext.userId || trip?.metadata?.userId || null,
            tripId: trip.tripId || null,
            playlistId: playlist.playlistId || null,
            outcome: 'retry_recovered',
            context: { failedAttempts: failedGuardrailAttempts.length, reasons: failedGuardrailAttempts.flatMap((attempt) => attempt.reasons || []).slice(0, 8) }
          });
        }

        if (req.body?.isRegeneration || req.body?.regeneratedFromPlaylistId) {
          await safeRecordFeedbackEvent({
            eventType: 'playlist_regenerated',
            userId: spotifyContext.userId || trip?.metadata?.userId || null,
            tripId: trip.tripId || null,
            playlistId: playlist.playlistId || null,
            outcome: 'created',
            context: { regeneratedFromPlaylistId: req.body?.regeneratedFromPlaylistId || null, tags: preferences?.tags || [] }
          });
        }

        return res.status(200).json(playlist);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError('Playlist generation failed.', { statusCode: 500, code: 'PLAYLIST_GENERATION_FAILED', details: getErrorCauseDetails(error) });
      }
    }
  };
}

module.exports = { createPlaylistsController };
