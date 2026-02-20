const test = require('node:test');
const assert = require('node:assert/strict');

const { initDb, recordFeedbackEvent, listFeedbackEvents, getFeedbackDashboard } = require('../src/db');

test('feedback events can be recorded and filtered in fallback store', async () => {
  delete process.env.DATABASE_URL;
  await initDb();

  const tripId = `trip-${Date.now()}`;
  const userId = `user-${Date.now()}`;

  await recordFeedbackEvent({
    eventType: 'thumbs_up',
    tripId,
    userId,
    outcome: 'liked',
    context: { source: 'test' }
  });

  await recordFeedbackEvent({
    eventType: 'parse_failure',
    tripId,
    userId,
    outcome: 'error',
    context: { source: 'google_maps' }
  });

  const events = await listFeedbackEvents({ tripId, limit: 10 });
  assert.equal(events.length >= 2, true);
  assert.equal(events.some((event) => event.event_type === 'thumbs_up'), true);
  assert.equal(events.some((event) => event.event_type === 'parse_failure'), true);
});

test('feedback dashboard summarizes key metrics', async () => {
  delete process.env.DATABASE_URL;
  await initDb();

  const userId = `summary-${Date.now()}`;
  await recordFeedbackEvent({ eventType: 'parse_success', userId, outcome: 'parsed' });
  await recordFeedbackEvent({ eventType: 'reminder_sent', userId, outcome: 'sent' });
  await recordFeedbackEvent({ eventType: 'playlist_regenerated', userId, outcome: 'created' });

  const dashboard = await getFeedbackDashboard({ days: 30, userId });
  assert.equal(dashboard.windowDays, 30);
  assert.equal(dashboard.parse.success, 1);
  assert.equal(dashboard.reminders.sent, 1);
  assert.equal(dashboard.regenerations, 1);
});
