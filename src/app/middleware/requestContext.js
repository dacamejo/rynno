const crypto = require('crypto');

function requestContext({ logger }) {
  return (req, res, next) => {
    req.requestId = req.get('x-request-id') || crypto.randomUUID();
    res.set('x-request-id', req.requestId);
    const startMs = Date.now();

    res.on('finish', () => {
      logger.info('HTTP request completed', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startMs
      });
    });

    next();
  };
}

module.exports = { requestContext };
