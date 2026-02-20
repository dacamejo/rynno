const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app/createServer');

async function withServer(run) {
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
