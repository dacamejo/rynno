const path = require('path');
const { AppError, NotFoundError, getErrorCauseDetails } = require('../../shared/errors');

function createMetaController({ getReminder, dispatchDueReminders, listDueReminders, getTripEntry, markReminderStatus, safeRecordFeedbackEvent, getBaseUrl }) {
  return {
    root(_req, res) {
      res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
    },
    health(_req, res) {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    },
    shareTarget(_req, res) {
      res.sendFile(path.join(process.cwd(), 'public', 'share-target.html'));
    },
    postShareTarget(_req, res) {
      return res.redirect(303, '/share-target');
    },
    async reminder(req, res) {
      const reminder = await getReminder(req.params.reminderId);
      if (!reminder) throw new NotFoundError('Reminder not found');
      return res.json(reminder);
    },
    async dispatchDue(req, res) {
      const summary = await dispatchDueReminders({
        db: { listDueReminders, getTripEntry, markReminderStatus },
        limit: Number(req.body?.limit || 25),
        notifyReminder: async (payload) => {
          console.log('Reminder dispatch', {
            reminderId: payload.reminderId,
            tripId: payload.tripId,
            userId: payload.userId,
            channel: payload.channel,
            scheduledFor: payload.scheduledFor
          });
        }
      });

      await Promise.all([
        ...(summary.sent || []).map((reminder) =>
          safeRecordFeedbackEvent({ eventType: 'reminder_sent', userId: reminder.user_id || null, tripId: reminder.trip_id || null, reminderId: reminder.reminder_id || null, outcome: 'sent', context: { channel: reminder.channel || null, scheduledFor: reminder.scheduled_for || null } })
        ),
        ...(summary.failed || []).map((failure) =>
          safeRecordFeedbackEvent({ eventType: 'reminder_failed', reminderId: failure.reminderId || null, outcome: 'failed', context: { error: failure.error || 'unknown reminder dispatch error' } })
        )
      ]);

      return res.json(summary);
    },
    contract(_req, res) {
      return res.json({
        endpoint: '/api/v1/trips/ingest',
        method: 'POST',
        request: { source: 'string', metadata: 'object', payload: { sharedTitle: 'string', sharedText: 'string', sharedUrl: 'string' } },
        response: { tripId: 'string', status: 'complete|error', canonical: 'object', manualCorrectionRequired: 'boolean', manualCorrectionPrompt: 'string|null' }
      });
    },
    async tripParserProxy(req, res) {
      const retries = Math.max(0, Math.min(2, Number(req.query.retries || 1)));
      let attempt = 0;
      let lastError = null;
      while (attempt <= retries) {
        try {
          const response = await fetch(`${getBaseUrl(req)}/api/v1/trips/ingest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(req.body || {})
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(`Ingest endpoint responded with HTTP ${response.status}: ${result.errors?.join(', ') || result.error || 'Parser request failed'}`);
          }

          return res.status(200).json({ ...result, attempts: attempt + 1 });
        } catch (error) {
          lastError = error;
          attempt += 1;
        }
      }

      throw new AppError('Trip parser request failed after retries.', {
        statusCode: 502,
        code: 'TRIP_PARSER_PROXY_FAILED',
        details: { details: getErrorCauseDetails(lastError), attempts: attempt }
      });
    }
  };
}

module.exports = { createMetaController };
