const { ValidationError } = require('./errors');

function optionalString(value) {
  return value == null || typeof value === 'string';
}

function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    if (body) {
      const err = body(req.body || {});
      if (err) return next(new ValidationError(err));
    }
    if (query) {
      const err = query(req.query || {});
      if (err) return next(new ValidationError(err));
    }
    if (params) {
      const err = params(req.params || {});
      if (err) return next(new ValidationError(err));
    }
    return next();
  };
}

module.exports = {
  validate,
  optionalString
};
