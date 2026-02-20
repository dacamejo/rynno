function createReminderRepository({ query, fallbackState, persistFallbackState }) {
  return {
    async createReminder({ tripId, userId = null, channel = 'in_app', scheduledFor, metadata = {} }) {
      if (query) {
        const result = await query(
          `INSERT INTO reminders (trip_id, user_id, channel, status, scheduled_for, metadata, updated_at)
           VALUES ($1,$2,$3,'scheduled',$4,$5,NOW())
           RETURNING reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at;`,
          [tripId, userId, channel, scheduledFor, metadata]
        );
        return result.rows[0];
      }

      const reminderId = String(Date.now() + Math.floor(Math.random() * 1000));
      const reminder = {
        reminder_id: reminderId,
        trip_id: tripId,
        user_id: userId,
        channel,
        status: 'scheduled',
        scheduled_for: scheduledFor,
        sent_at: null,
        failure_reason: null,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      fallbackState.reminders[reminderId] = reminder;
      await persistFallbackState();
      return reminder;
    },

    async getReminder(reminderId) {
      if (query) {
        const result = await query(
          `SELECT reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at
           FROM reminders
           WHERE reminder_id = $1`,
          [reminderId]
        );
        return result.rows[0] || null;
      }

      return fallbackState.reminders[reminderId] || null;
    },

    async listDueReminders(referenceIso, limit = 25) {
      if (query) {
        const result = await query(
          `SELECT reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at
           FROM reminders
           WHERE status = 'scheduled'
             AND scheduled_for <= $1::timestamptz
           ORDER BY scheduled_for ASC
           LIMIT $2`,
          [referenceIso, limit]
        );
        return result.rows;
      }

      return Object.values(fallbackState.reminders)
        .filter((item) => item.status === 'scheduled' && new Date(item.scheduled_for) <= new Date(referenceIso))
        .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))
        .slice(0, limit);
    },

    async markReminderStatus(reminderId, { status, sentAt = null, failureReason = null, metadataPatch = null }) {
      if (query) {
        const result = await query(
          `UPDATE reminders
           SET status = $2,
               sent_at = $3,
               failure_reason = $4,
               metadata = CASE WHEN $5::jsonb IS NULL THEN metadata ELSE metadata || $5::jsonb END,
               updated_at = NOW()
           WHERE reminder_id = $1
           RETURNING reminder_id, trip_id, user_id, channel, status, scheduled_for, sent_at, failure_reason, metadata, created_at, updated_at;`,
          [reminderId, status, sentAt, failureReason, metadataPatch ? JSON.stringify(metadataPatch) : null]
        );
        return result.rows[0] || null;
      }

      const existing = fallbackState.reminders[reminderId];
      if (!existing) {
        return null;
      }

      existing.status = status;
      existing.sent_at = sentAt;
      existing.failure_reason = failureReason;
      if (metadataPatch && typeof metadataPatch === 'object') {
        existing.metadata = { ...(existing.metadata || {}), ...metadataPatch };
      }
      existing.updated_at = new Date().toISOString();
      await persistFallbackState();
      return existing;
    }
  };
}

module.exports = { createReminderRepository };
