const HTTP_CONFIG = Object.freeze({
  idempotencyTtlMs: 24 * 60 * 60 * 1000,
  maxIdempotencyKeyLength: 128
});

module.exports = { HTTP_CONFIG };
