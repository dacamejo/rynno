const { UnauthorizedError } = require('./errors');

function requireInternalApiKey() {
  return (req, _res, next) => {
    const internalApiKey = process.env.INTERNAL_API_KEY;
    if (internalApiKey && req.get('x-api-key') !== internalApiKey) {
      return next(new UnauthorizedError('Unauthorized request.'));
    }
    return next();
  };
}

module.exports = { requireInternalApiKey };
