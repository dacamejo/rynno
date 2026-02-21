class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || 'AppError';
    this.statusCode = options.statusCode || 500;
    this.code = options.code || 'APP_ERROR';
    this.details = options.details || null;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { name: 'ValidationError', statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { name: 'UnauthorizedError', statusCode: 401, code: 'UNAUTHORIZED' });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, { name: 'NotFoundError', statusCode: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, { name: 'ConflictError', statusCode: 409, code: 'CONFLICT', details });
  }
}

function getErrorCauseDetails(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.response) {
    const { status, data } = error.response;
    if (typeof data === 'string' && data.trim()) {
      return `HTTP ${status}: ${data}`;
    }

    if (data && typeof data === 'object') {
      const responseError = data.error_description || data.error?.message || data.error || data.message;
      if (responseError) {
        return `HTTP ${status}: ${responseError}`;
      }
      return `HTTP ${status}: ${JSON.stringify(data)}`;
    }

    return `HTTP ${status}`;
  }

  const parts = [error.message];
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.cause && error.cause !== error.message) {
    parts.push(`cause=${error.cause}`);
  }

  return parts.filter(Boolean).join(' | ') || 'Unknown error';
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function errorHandler({ logger }) {
  return (error, req, res, _next) => {
    const statusCode = error.statusCode || 500;
    const details = error.details || getErrorCauseDetails(error);

    logger.error('Request failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      error: error.message,
      details
    });

    res.status(statusCode).json({
      error: error.message || 'Internal server error',
      details: statusCode >= 500 ? details : error.details || undefined,
      code: error.code || 'INTERNAL_ERROR',
      requestId: req.requestId
    });
  };
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  getErrorCauseDetails,
  asyncHandler,
  errorHandler
};
