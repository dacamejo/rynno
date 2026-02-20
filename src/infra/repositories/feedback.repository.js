function summarizeFeedbackEvents(events = []) {
  const summary = {
    totalEvents: events.length,
    byEventType: {},
    thumbs: { up: 0, down: 0 },
    parse: { success: 0, failure: 0 },
    reminders: { sent: 0, failed: 0 },
    guardrailFailures: 0,
    regenerations: 0
  };

  events.forEach((event) => {
    summary.byEventType[event.event_type] = (summary.byEventType[event.event_type] || 0) + 1;
    if (event.event_type === 'thumbs_up') summary.thumbs.up += 1;
    if (event.event_type === 'thumbs_down') summary.thumbs.down += 1;
    if (event.event_type === 'parse_success') summary.parse.success += 1;
    if (event.event_type === 'parse_failure') summary.parse.failure += 1;
    if (event.event_type === 'reminder_sent') summary.reminders.sent += 1;
    if (event.event_type === 'reminder_failed') summary.reminders.failed += 1;
    if (event.event_type === 'guardrail_failure') summary.guardrailFailures += 1;
    if (event.event_type === 'playlist_regenerated') summary.regenerations += 1;
  });

  return summary;
}

function createFeedbackRepository({ query, fallbackState, persistFallbackState }) {
  return {
    async recordFeedbackEvent({
      eventType,
      userId = null,
      tripId = null,
      reminderId = null,
      playlistId = null,
      rating = null,
      feedbackText = null,
      outcome = null,
      context = {},
      occurredAt = new Date().toISOString()
    }) {
      if (query) {
        const result = await query(
          `INSERT INTO feedback_events
          (event_type, user_id, trip_id, reminder_id, playlist_id, rating, feedback_text, outcome, context, occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING feedback_event_id, event_type, user_id, trip_id, reminder_id, playlist_id, rating, feedback_text, outcome, context, occurred_at, created_at;`,
          [eventType, userId, tripId, reminderId, playlistId, rating, feedbackText, outcome, context, occurredAt]
        );
        return result.rows[0];
      }

      const event = {
        feedback_event_id: String(Date.now() + Math.floor(Math.random() * 1000)),
        event_type: eventType,
        user_id: userId,
        trip_id: tripId,
        reminder_id: reminderId,
        playlist_id: playlistId,
        rating,
        feedback_text: feedbackText,
        outcome,
        context,
        occurred_at: occurredAt,
        created_at: new Date().toISOString()
      };

      fallbackState.feedbackEvents.push(event);
      await persistFallbackState();
      return event;
    },

    async listFeedbackEvents({ userId = null, tripId = null, eventType = null, limit = 100 } = {}) {
      const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

      if (query) {
        const values = [];
        const where = [];

        if (userId) {
          values.push(userId);
          where.push(`user_id = $${values.length}`);
        }
        if (tripId) {
          values.push(tripId);
          where.push(`trip_id = $${values.length}`);
        }
        if (eventType) {
          values.push(eventType);
          where.push(`event_type = $${values.length}`);
        }
        values.push(boundedLimit);

        const result = await query(
          `SELECT feedback_event_id, event_type, user_id, trip_id, reminder_id, playlist_id, rating, feedback_text, outcome, context, occurred_at, created_at
           FROM feedback_events
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY occurred_at DESC
           LIMIT $${values.length}`,
          values
        );
        return result.rows;
      }

      return fallbackState.feedbackEvents
        .filter((event) => (userId ? event.user_id === userId : true))
        .filter((event) => (tripId ? event.trip_id === tripId : true))
        .filter((event) => (eventType ? event.event_type === eventType : true))
        .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
        .slice(0, boundedLimit);
    },

    async getFeedbackDashboard({ days = 30, userId = null } = {}) {
      const windowDays = Math.max(1, Math.min(Number(days) || 30, 180));
      const lowerBound = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

      if (query) {
        const values = [lowerBound];
        const userClause = userId ? ' AND user_id = $2' : '';
        if (userId) {
          values.push(userId);
        }

        const result = await query(
          `SELECT feedback_event_id, event_type, user_id, trip_id, reminder_id, playlist_id, rating, feedback_text, outcome, context, occurred_at, created_at
           FROM feedback_events
           WHERE occurred_at >= $1::timestamptz${userClause}
           ORDER BY occurred_at DESC`,
          values
        );

        return {
          windowDays,
          generatedAt: new Date().toISOString(),
          ...summarizeFeedbackEvents(result.rows)
        };
      }

      const events = fallbackState.feedbackEvents.filter(
        (event) => new Date(event.occurred_at) >= new Date(lowerBound) && (userId ? event.user_id === userId : true)
      );

      return {
        windowDays,
        generatedAt: new Date().toISOString(),
        ...summarizeFeedbackEvents(events)
      };
    }
  };
}

module.exports = { createFeedbackRepository };
