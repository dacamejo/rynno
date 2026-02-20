const crypto = require('crypto');
const { getErrorCauseDetails, AppError, NotFoundError } = require('../../shared/errors');

async function createStoreEntry({ canonical, payload, metadata, source, status, errors }) {
  return {
    status,
    canonical,
    rawPayload: payload,
    source,
    metadata,
    lastUpdated: new Date().toISOString(),
    errors: errors || []
  };
}

function createTripsController({ runAdapter, db, reminderScheduler, generatePlaylist, getOAuthToken }) {
  return {
    async ingest(req, res) {
      const { source, metadata = {}, payload, tripId: providedTripId } = req.body;
      const tripId = providedTripId || crypto.randomUUID();
      const normalizedSource = source || payload.source || 'manual';

      try {
        const canonical = await runAdapter({ tripId, source: normalizedSource, payload, metadata });
        const storeEntry = await createStoreEntry({ canonical, payload, metadata, source: normalizedSource, status: 'complete' });
        await db.saveTripEntry(tripId, storeEntry);
        await db.safeRecordFeedbackEvent({
          eventType: 'parse_success',
          userId: metadata?.userId || null,
          tripId,
          outcome: canonical?.validation?.needsManualReview ? 'manual_review_required' : 'parsed',
          context: { source: normalizedSource, confidenceScore: canonical?.validation?.confidenceScore || null, manualCorrectionRequired: canonical?.validation?.needsManualReview || false }
        });

        return res.status(201).json({
          tripId,
          status: storeEntry.status,
          canonical,
          manualCorrectionRequired: canonical?.validation?.needsManualReview || false,
          manualCorrectionPrompt: canonical?.validation?.needsManualReview ? 'We need a few more trip details to fine-tune your playlist. Please confirm route and timing.' : null
        });
      } catch (error) {
        const details = getErrorCauseDetails(error);
        const storeEntry = await createStoreEntry({ canonical: null, payload, metadata, source: normalizedSource, status: 'error', errors: [details] });
        await db.saveTripEntry(tripId, storeEntry);
        await db.safeRecordFeedbackEvent({ eventType: 'parse_failure', userId: metadata?.userId || null, tripId, outcome: 'error', context: { source: normalizedSource, errors: [details] } });
        throw new AppError('Trip ingestion failed.', { statusCode: 400, code: 'TRIP_INGESTION_FAILED', details: { tripId, errors: storeEntry.errors } });
      }
    },

    async status(req, res) {
      const entry = await db.getTripEntry(req.params.tripId);
      if (!entry) throw new NotFoundError('Trip not found');
      return res.json({ tripId: req.params.tripId, status: entry.status, canonical: entry.canonical, errors: entry.errors });
    },

    async refresh(req, res) {
      const entry = await db.getTripEntry(req.params.tripId);
      if (!entry) throw new NotFoundError('Trip not found');

      const tripId = req.params.tripId;
      const payload = entry.rawPayload || {};
      const metadata = entry.metadata || {};

      try {
        const canonical = await runAdapter({ tripId, source: entry.source, payload, metadata });
        const updatedEntry = await createStoreEntry({ canonical, payload, metadata, source: entry.source, status: 'complete' });
        await db.saveTripEntry(tripId, updatedEntry);
        return res.json({ tripId, status: updatedEntry.status, canonical, manualCorrectionRequired: canonical?.validation?.needsManualReview || false });
      } catch (error) {
        const details = getErrorCauseDetails(error);
        const updatedEntry = await createStoreEntry({ canonical: null, payload, metadata, source: entry.source, status: 'error', errors: [details] });
        await db.saveTripEntry(tripId, updatedEntry);
        throw new AppError('Trip refresh failed.', { statusCode: 500, code: 'TRIP_REFRESH_FAILED', details: { tripId, errors: updatedEntry.errors } });
      }
    },

    async createReminder(req, res) {
      const entry = await db.getTripEntry(req.params.tripId);
      if (!entry) throw new NotFoundError('Trip not found');
      const leadMinutes = Number(req.body?.leadMinutes ?? 20);
      const scheduledFor = req.body?.scheduledFor || reminderScheduler.getReminderScheduleTime(entry.canonical, Number.isFinite(leadMinutes) ? leadMinutes : 20);
      if (!scheduledFor) throw new AppError('Unable to compute scheduled reminder time for this trip.', { statusCode: 400, code: 'SCHEDULE_UNAVAILABLE' });

      const reminder = await db.createReminder({
        tripId: req.params.tripId,
        userId: req.body?.userId || entry.metadata?.userId || null,
        channel: req.body?.channel || 'in_app',
        scheduledFor,
        metadata: { leadMinutes: Number.isFinite(leadMinutes) ? leadMinutes : 20, playlistUrl: req.body?.playlistUrl || null, autoRefreshPlaylist: req.body?.autoRefreshPlaylist !== false }
      });

      return res.status(201).json({ status: 'scheduled', reminder });
    },

    async refreshLoop(req, res) {
      const horizonMinutes = Number(req.body?.horizonMinutes || 120);
      const delayThresholdSeconds = Number(req.body?.delayThresholdSeconds || 300);

      const summary = await reminderScheduler.refreshTripsForDelays({
        db: { listTripsForRefresh: db.listTripsForRefresh },
        horizonMinutes,
        delayThresholdSeconds,
        runTripRefresh: async (tripId) => {
          const entry = await db.getTripEntry(tripId);
          if (!entry) return null;
          const canonical = await runAdapter({ tripId, source: entry.source, payload: entry.rawPayload || {}, metadata: entry.metadata || {} });
          const updatedEntry = await createStoreEntry({ canonical, payload: entry.rawPayload || {}, metadata: entry.metadata || {}, source: entry.source, status: 'complete' });
          await db.saveTripEntry(tripId, updatedEntry);
          return updatedEntry;
        },
        maybeRefreshPlaylist: async ({ refreshedTrip, timingShift }) => {
          const userId = refreshedTrip?.metadata?.userId || req.body?.userId || null;
          if (!userId) return { attempted: false, reason: 'missing_user' };
          const tokenEntry = await getOAuthToken(userId, 'spotify');
          if (!tokenEntry) return { attempted: false, reason: 'missing_spotify_token' };
          if (req.body?.refreshPlaylist === false) return { attempted: false, reason: 'disabled_by_request' };
          try {
            const playlist = await generatePlaylist({ trip: refreshedTrip, preferences: req.body?.preferences || {}, spotify: { accessToken: tokenEntry.accessToken, refreshToken: tokenEntry.refreshToken } });
            return { attempted: true, refreshed: true, timingShiftSeconds: timingShift.deltaSeconds, playlistId: playlist?.playlistId || playlist?.id || null, playlistUrl: playlist?.playlistUrl || playlist?.externalUrl || null };
          } catch (error) {
            return { attempted: true, refreshed: false, timingShiftSeconds: timingShift.deltaSeconds, error: getErrorCauseDetails(error) };
          }
        }
      });

      return res.json(summary);
    }
  };
}

module.exports = { createTripsController };
