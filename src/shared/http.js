const { UnauthorizedError, ValidationError, ConflictError } = require('./errors');

class InMemoryIdempotencyStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  get(scopeKey) {
    const existing = this.entries.get(scopeKey);
    if (!existing) {
      return null;
    }

    if (existing.expiresAt <= Date.now()) {
      this.entries.delete(scopeKey);
      return null;
    }

    return existing;
  }

  set(scopeKey, value) {
    this.entries.set(scopeKey, {
      ...value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  delete(scopeKey) {
    this.entries.delete(scopeKey);
  }
}

function requireInternalApiKey() {
  return (req, _res, next) => {
    const internalApiKey = process.env.INTERNAL_API_KEY;
    if (internalApiKey && req.get('x-api-key') !== internalApiKey) {
      return next(new UnauthorizedError('Unauthorized request.'));
    }
    return next();
  };
}

function createIdempotencyMiddleware({ store = new InMemoryIdempotencyStore(), methods = ['POST', 'PUT', 'PATCH', 'DELETE'] } = {}) {
  const methodSet = new Set(methods.map((method) => String(method || '').toUpperCase()));

  return (req, res, next) => {
    if (!methodSet.has(req.method.toUpperCase())) {
      return next();
    }

    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey) {
      return next();
    }

    if (idempotencyKey.length > 128) {
      return next(new ValidationError('idempotency-key header must be 128 characters or less.'));
    }

    const scopeKey = `${req.method.toUpperCase()}:${req.path}:${idempotencyKey}`;
    const fingerprint = JSON.stringify(req.body || {});
    const existing = store.get(scopeKey);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return next(new ConflictError('Idempotency key was already used with a different request payload.', { idempotencyKey }));
      }

      if (existing.state === 'in_flight') {
        return next(new ConflictError('A request with this idempotency key is already in progress.', { idempotencyKey }));
      }

      res.set('idempotent-replayed', 'true');
      return res.status(existing.statusCode).json(existing.body);
    }

    store.set(scopeKey, { state: 'in_flight', fingerprint });

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) {
        store.set(scopeKey, {
          state: 'completed',
          fingerprint,
          statusCode: res.statusCode,
          body
        });
      } else {
        store.delete(scopeKey);
      }

      return originalJson(body);
    };

    res.on('close', () => {
      const saved = store.get(scopeKey);
      if (!saved || saved.state === 'in_flight') {
        store.delete(scopeKey);
      }
    });

    return next();
  };
}

module.exports = { requireInternalApiKey, createIdempotencyMiddleware, InMemoryIdempotencyStore };
