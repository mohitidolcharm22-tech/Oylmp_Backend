const jwt     = require('jsonwebtoken')
const User    = require('../models/User')
const AppError = require('../utils/AppError')
const catchAsync = require('../utils/catchAsync')

/* ─────────────────────────────────────────────────────────────────────────────
   protect — verify JWT access token on every protected route
   ───────────────────────────────────────────────────────────────────────────── */
exports.protect = catchAsync(async (req, res, next) => {
  // 1. Get token from Authorization header
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401))
  }

  const token = authHeader.split(' ')[1]

  // 2. Verify token
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401))
    }
    return next(new AppError('Invalid token. Please log in again.', 401))
  }

  if (decoded.type !== 'access') {
    return next(new AppError('Invalid token type.', 401))
  }

  // 3. Check user still exists
  const currentUser = await User.findById(decoded.sub)
  if (!currentUser) {
    return next(new AppError('The account belonging to this token no longer exists.', 401))
  }

  // 4. Check account is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 403))
  }

  // 5. Check if password was changed after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password was recently changed. Please log in again.', 401))
  }

  // 6. Grant access
  req.user = currentUser
  next()
})

/* ─────────────────────────────────────────────────────────────────────────────
   restrictTo — role-based access control (RBAC)
   Usage: restrictTo('admin', 'teacher')
   ───────────────────────────────────────────────────────────────────────────── */
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. This action requires one of these roles: ${roles.join(', ')}.`, 403))
  }
  next()
}
