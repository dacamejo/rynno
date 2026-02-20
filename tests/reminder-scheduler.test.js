const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getReminderScheduleTime,
  detectTimingShift,
  dispatchDueReminders,
  refreshTripsForDelays
} = require('../services/reminderScheduler');

test('getReminderScheduleTime computes pre-departure reminder time', () => {
  const scheduled = getReminderScheduleTime({ firstDeparture: '2026-01-15T10:00:00.000Z' }, 30);
  assert.equal(scheduled, '2026-01-15T09:30:00.000Z');
});

test('detectTimingShift flags significant changes only', () => {
  const unchanged = detectTimingShift(
    { firstDeparture: '2026-01-15T10:00:00.000Z' },
    { firstDeparture: '2026-01-15T10:03:00.000Z' },
    300
  );

  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.reason, 'within_threshold');

  const changed = detectTimingShift(
    { firstDeparture: '2026-01-15T10:00:00.000Z' },
    { firstDeparture: '2026-01-15T10:11:00.000Z' },
    300
  );

  assert.equal(changed.changed, true);
  assert.equal(changed.deltaSeconds, 660);
});

test('dispatchDueReminders marks reminders as sent and failed', async () => {
  const reminders = [
    {
      reminder_id: 'r1',
      trip_id: 'trip-1',
      user_id: 'user-1',
      channel: 'in_app',
      scheduled_for: '2026-01-15T09:00:00.000Z',
      metadata: {}
    },
    {
      reminder_id: 'r2',
      trip_id: 'trip-2',
      user_id: 'user-2',
      channel: 'email',
      scheduled_for: '2026-01-15T09:01:00.000Z',
      metadata: {}
    }
  ];

  const updates = [];
  const summary = await dispatchDueReminders({
    db: {
      listDueReminders: async () => reminders,
      getTripEntry: async () => ({ canonical: { firstDeparture: '2026-01-15T10:00:00.000Z' } }),
      markReminderStatus: async (reminderId, update) => {
        updates.push({ reminderId, update });
        return { reminder_id: reminderId, ...update };
      }
    },
    notifyReminder: async (payload) => {
      if (payload.reminderId === 'r2') {
        throw new Error('delivery failed');
      }
    }
  });

  assert.equal(summary.processed, 2);
  assert.equal(summary.sentCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(updates[0].update.status, 'sent');
  assert.equal(updates[1].update.status, 'failed');
});

test('refreshTripsForDelays requests playlist refresh on timing shifts', async () => {
  const summary = await refreshTripsForDelays({
    db: {
      listTripsForRefresh: async () => [
        {
          tripId: 'trip-1',
          entry: { canonical: { firstDeparture: '2026-01-15T10:00:00.000Z' } }
        }
      ]
    },
    runTripRefresh: async () => ({ canonical: { firstDeparture: '2026-01-15T10:12:00.000Z' } }),
    maybeRefreshPlaylist: async ({ tripId }) => ({ attempted: true, refreshed: true, tripId }),
    delayThresholdSeconds: 300
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.refreshedTrips[0].timingShift.changed, true);
  assert.equal(summary.refreshedTrips[0].playlistRefresh.refreshed, true);
});
