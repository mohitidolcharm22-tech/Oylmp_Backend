const AppError = require('../utils/AppError')

/* ─────────────────────────────────────────────────────────────────────────────
   Handle specific Mongoose / JWT errors and convert them to AppError
   ───────────────────────────────────────────────────────────────────────────── */
const handleCastErrorDB = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}.`, 400)

const handleDuplicateKeyDB = (err) => {
  const field = Object.keys(err.keyValue)[0]
  const value = err.keyValue[field]
  return new AppError(`The ${field} '${value}' is already in use. Please use a different value.`, 409)
}

const handleValidationErrorDB = (err) => {
  const messages = Object.values(err.errors).map(e => e.message)
  return new AppError(`Validation failed: ${messages.join('. ')}`, 422)
}

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401)

const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again.', 401)

/* ─────────────────────────────────────────────────────────────────────────────
   Development error response — full stack trace
   ───────────────────────────────────────────────────────────────────────────── */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status:     err.status,
    message:    err.message,
    stack:      err.stack,
    error:      err,
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   Production error response — only leak operational errors to clients
   ───────────────────────────────────────────────────────────────────────────── */
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status:  err.status,
      message: err.message,
    })
  }
  // Programming / unknown error — don't leak details
  console.error('💥 UNEXPECTED ERROR:', err)
  res.status(500).json({
    status:  'error',
    message: 'Something went wrong. Please try again later.',
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   Global error handling middleware (4 arguments = Express error handler)
   ───────────────────────────────────────────────────────────────────────────── */
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500
  err.status     = err.status     || 'error'

  if (process.env.NODE_ENV === 'development') {
    return sendErrorDev(err, res)
  }

  // Transform known error types into operational AppErrors for production
  let error = Object.create(err)
  if (err.name === 'CastError')               error = handleCastErrorDB(err)
  if (err.code  === 11000)                    error = handleDuplicateKeyDB(err)
  if (err.name === 'ValidationError')         error = handleValidationErrorDB(err)
  if (err.name === 'JsonWebTokenError')        error = handleJWTError()
  if (err.name === 'TokenExpiredError')        error = handleJWTExpiredError()

  sendErrorProd(error, res)
}

module.exports = globalErrorHandler
