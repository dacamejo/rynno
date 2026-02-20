const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app/createServer');
const db = require('../src/db');

async function withServer(run) {
  await db.initDb({ storageProvider: new db.__internals.MemoryStorageProvider() });
  const app = createServer();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('health endpoint includes request correlation id header', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'healthy');
    assert.ok(response.headers.get('x-request-id'));
  });
});

test('validation errors use standardized envelope with requestId', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/trips/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.equal(payload.error, 'Missing payload. Provide a `payload` object with trip details.');
    assert.ok(payload.requestId);
  });
});

test('internal-api-key rejections return standardized unauthorized envelope', async () => {
  const previous = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = 'test-key';

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/reminders/dispatch-due`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      const payload = await response.json();

      assert.equal(response.status, 401);
      assert.equal(payload.code, 'UNAUTHORIZED');
      assert.equal(payload.error, 'Unauthorized request.');
      assert.ok(payload.requestId);
    });
  } finally {
    if (previous == null) {
      delete process.env.INTERNAL_API_KEY;
    } else {
      process.env.INTERNAL_API_KEY = previous;
    }
  }
});


test('feedback list rejects invalid limit query with validation envelope', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/feedback/events?limit=abc`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.ok(payload.requestId);
  });
});


test('playlist generation validates missing spotify credentials at boundary', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/playlists/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trip: { tripId: 't1' } })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.ok(payload.requestId);
  });
});

test('trip reminder creation validates numeric leadMinutes', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/trips/trip-123/reminders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadMinutes: 'not-a-number' })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.equal(payload.error, 'leadMinutes must be numeric when provided.');
    assert.ok(payload.requestId);
  });
});

test('auth token refresh validates required userId', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/spotify/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.equal(payload.error, 'Missing userId.');
    assert.ok(payload.requestId);
  });
});

test('feedback event creation validates supported eventType', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/feedback/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'unknown_type' })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.match(payload.error, /Unsupported eventType/);
    assert.ok(payload.requestId);
  });
});

test('feedback dashboard validates numeric days query', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/feedback/dashboard?days=oops`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.equal(payload.error, 'days must be numeric when provided.');
    assert.ok(payload.requestId);
  });
});
