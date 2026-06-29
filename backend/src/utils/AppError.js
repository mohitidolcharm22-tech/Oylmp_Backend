/**
 * Operational (expected) API error — carries an HTTP status code.
 * Non-operational errors (programming bugs, DB failures) are handled
 * separately in the global error handler.
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
    this.status = String(statusCode).startsWith('4') ? 'fail' : 'error'
    this.isOperational = true

    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = AppError
