const jwt     = require('jsonwebtoken')
const User    = require('../models/User')
const AppError = require('../utils/AppError')
const catchAsync = require('../utils/catchAsync')

/* ─────────────────────────────────────────────────────────────────────────────
   protect — verify JWT and attach user to req
   ─────────────────────────────────────────────────────────────────────────────
   HOW JWT AUTHORIZATION WORKS (step by step)
   ────────────────────────────────────────────
   1. Client sends:  Authorization: Bearer <accessToken>
   2. We verify the token's SIGNATURE using JWT_SECRET.
      If tampered or expired → 401. No DB call yet.
   3. We read the CLAIMS embedded in the token:
        { sub, type, role, permissions }
      → role & permissions come straight from the token — no DB lookup needed.
   4. We still do ONE DB query to confirm the user account is active and the
      password hasn't changed since the token was issued (security hardening).
   5. req.user gets the DB user + the token's permission claims merged in.
   ───────────────────────────────────────────────────────────────────────────── */
exports.protect = catchAsync(async (req, res, next) => {
  // ── Step 1: Extract token from HttpOnly cookie ──────────────────────────
  // The browser sends the cookie automatically — no JS involvement needed.
  // Fallback to Authorization header for non-browser clients (Postman, mobile).
  const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1]
  if (!token) {
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401))
  }

  // ── Step 2: Verify signature & expiry (no DB call) ───────────────────────
  // jwt.verify() throws if the signature is wrong or the token is expired.
  // This proves the token was issued by US and hasn't been tampered with.
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401))
    }
    return next(new AppError('Invalid token. Please log in again.', 401))
  }

  // Guard: only accept access tokens (not refresh tokens) on API routes.
  if (decoded.type !== 'access') {
    return next(new AppError('Invalid token type.', 401))
  }

  // ── Step 3: Read role & permissions from token claims (no DB call) ────────
  // Because we embedded role + permissions when signing, we get authorization
  // info for free — the token IS the permission slip.
  const { role, permissions = [] } = decoded

  // ── Step 4: One DB query — verify account is still valid ─────────────────
  // We can't detect account deactivation or password changes from the token
  // alone, so we do a minimal DB lookup (no large arrays).
  const currentUser = await User.findById(decoded.sub)
    .select('+passwordChangedAt -completedLessons -teacherBadges')
  if (!currentUser) {
    return next(new AppError('The account belonging to this token no longer exists.', 401))
  }
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 403))
  }
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password was recently changed. Please log in again.', 401))
  }

  // ── Step 5: Attach to req ─────────────────────────────────────────────────
  // Merge token claims with the DB user so downstream handlers get everything.
  // req.user.role        — from token (fast, no extra query)
  // req.user.permissions — from token (fast, no extra query)
  req.user = currentUser
  req.user.role        = role        // trust token over DB value for this request
  req.user.permissions = permissions // fine-grained permission array
  next()
})

/* ─────────────────────────────────────────────────────────────────────────────
   restrictTo — coarse-grained role check
   Usage: router.delete('/:id', protect, restrictTo('admin', 'super_admin'), ...)
   ─────────────────────────────────────────────────────────────────────────────
   Reads req.user.role which was set from the JWT claims — no DB call.
   ───────────────────────────────────────────────────────────────────────────── */
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. This action requires one of these roles: ${roles.join(', ')}.`, 403))
  }
  next()
}

/* ─────────────────────────────────────────────────────────────────────────────
   checkPermission — fine-grained permission check
   Usage: router.post('/', protect, checkPermission('quiz:create'), ...)
   ─────────────────────────────────────────────────────────────────────────────
   Reads req.user.permissions (array embedded in the JWT).
   No DB call — pure token-based authorization.

   WHY USE THIS INSTEAD OF restrictTo?
   restrictTo('teacher', 'admin') is brittle — you must update the list every
   time a new role is added. checkPermission('quiz:create') stays stable;
   you only update ROLE_PERMISSIONS in permissions.js to grant a new role access.
   ───────────────────────────────────────────────────────────────────────────── */
exports.checkPermission = (permission) => (req, res, next) => {
  if (!req.user?.permissions?.includes(permission)) {
    return next(
      new AppError(`Access denied. You need the '${permission}' permission.`, 403)
    )
  }
  next()
}

/* ─────────────────────────────────────────────────────────────────────────────
   scopeToSchool — injects { schoolId } into req.schoolFilter
   ● super_admin: no filter (sees all schools)
   ● everyone else: filters by their own schoolId
   Use this on any route that should be school-scoped.
   ───────────────────────────────────────────────────────────────────────────── */
exports.scopeToSchool = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    req.schoolFilter = req.query.schoolId ? { schoolId: req.query.schoolId } : {}
  } else {
    if (!req.user.schoolId) {
      return next(new AppError('Your account is not associated with a school.', 403))
    }
    req.schoolFilter = { schoolId: req.user.schoolId }
  }
  next()
}
