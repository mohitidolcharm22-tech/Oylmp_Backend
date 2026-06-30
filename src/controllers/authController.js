const crypto                = require('crypto')
const jwt                   = require('jsonwebtoken')
const { validationResult } = require('express-validator')
const User                  = require('../models/User')
const AppError              = require('../utils/AppError')
const catchAsync            = require('../utils/catchAsync')
const { signAccessToken, signRefreshToken, sendRefreshCookie } = require('../utils/jwt')

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — send back tokens + sanitised user
   ───────────────────────────────────────────────────────────────────────────── */
const sendAuthResponse = (user, statusCode, res) => {
  const accessToken  = signAccessToken(user._id)
  const refreshToken = signRefreshToken(user._id)

  // Store refresh token hash in DB (optional hardening — skip for POC)
  // user.refreshToken = refreshToken; user.save({ validateBeforeSave: false })

  sendRefreshCookie(res, refreshToken)

  // Remove sensitive fields before sending
  user.password = undefined

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    data: { user },
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/register
   ───────────────────────────────────────────────────────────────────────────── */
exports.register = catchAsync(async (req, res, next) => {
  // 1. Validate input
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: 'fail',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  const { name, email, password, role, grade, phone, username } = req.body

  // 2. Check for duplicate email (only if provided)
  if (email) {
    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) return next(new AppError('An account with this email already exists.', 409))
  }

  // 2b. Check for duplicate username (students)
  if (username) {
    const existing = await User.findOne({ username: username.toLowerCase().trim() })
    if (existing) return next(new AppError('That username is already taken.', 409))
  }

  // Require either email or username
  if (!email && !username) {
    return next(new AppError('Email or username is required.', 400))
  }

  // 3. Build new user
  const userData = { name: name.trim(), password, role }
  if (email)    userData.email    = email
  if (username) userData.username = username.toLowerCase().trim()
  if (role === 'student' && grade) userData.grade = grade
  if (phone)                       userData.phone = phone

  const user = await User.create(userData)

  // 4. Respond with tokens
  sendAuthResponse(user, 201, res)
})

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/login   (stub — ready for next sprint)
   ───────────────────────────────────────────────────────────────────────────── */
exports.login = catchAsync(async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: 'fail',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    })
  }

  const { email, password } = req.body
  const identifier = (email || '').trim().toLowerCase()

  // Find by email OR username
  const user = await User.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
    ],
  }).select('+password')

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Incorrect email/username or password.', 401))
  }

  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403))
  }

  sendAuthResponse(user, 200, res)
})

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/logout
   ───────────────────────────────────────────────────────────────────────────── */
exports.logout = (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' })
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' })
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/auth/me   (requires auth middleware)
   ───────────────────────────────────────────────────────────────────────────── */
exports.getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate('teacherBadges.awardedBy', 'name')
    .lean()
  res.status(200).json({ status: 'success', data: { user } })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/auth/users  — Admin: list all users
   ───────────────────────────────────────────────────────────────────────────── */
exports.listUsers = catchAsync(async (req, res) => {
  const { role, search } = req.query

  // Pagination: ?page=1&limit=50 (caps at 200 per page).
  const page  = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const skip  = (page - 1) * limit

  const filter = {}
  if (role) filter.role = role
  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ])
  res.status(200).json({
    status: 'success',
    results: users.length,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: { users },
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   PATCH /api/v1/auth/users/:id/reset-password  — Admin: set a new password
   ───────────────────────────────────────────────────────────────────────────── */
exports.resetUserPassword = catchAsync(async (req, res, next) => {
  const { newPassword } = req.body
  if (!newPassword || newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters.', 400))
  }

  const user = await User.findById(req.params.id).select('+password')
  if (!user) return next(new AppError('User not found.', 404))

  user.password = newPassword
  await user.save()

  res.status(200).json({ status: 'success', message: `Password reset for ${user.name}.` })
})

/* ─────────────────────────────────────────────────────────────────────────────
   PATCH /api/v1/auth/users/:id/toggle-status  — Admin: enable / disable user
   ───────────────────────────────────────────────────────────────────────────── */
exports.toggleUserStatus = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
  if (!user) return next(new AppError('User not found.', 404))

  // Prevent admin from disabling themselves
  if (user._id.equals(req.user._id)) {
    return next(new AppError('You cannot change your own account status.', 400))
  }

  user.isActive = !user.isActive
  await user.save({ validateBeforeSave: false })

  res.status(200).json({
    status: 'success',
    message: `User has been ${user.isActive ? 'enabled' : 'disabled'}.`,
    data: { user },
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/refresh
   Issues a new access token from a valid refresh-token cookie. The cookie is
   set by sendAuthResponse() on login/register.
   ───────────────────────────────────────────────────────────────────────────── */
exports.refresh = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken
  if (!token) return next(new AppError('No refresh token. Please log in again.', 401))

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
  } catch {
    return next(new AppError('Invalid or expired refresh token. Please log in again.', 401))
  }
  if (decoded.type !== 'refresh') {
    return next(new AppError('Invalid token type.', 401))
  }

  const user = await User.findById(decoded.sub).select('+passwordChangedAt')
  if (!user || !user.isActive) {
    return next(new AppError('Account no longer available.', 401))
  }
  if (user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password was changed. Please log in again.', 401))
  }

  const accessToken = signAccessToken(user._id)
  // Rotate the refresh token so a stolen one has limited shelf-life.
  sendRefreshCookie(res, signRefreshToken(user._id))

  res.status(200).json({ status: 'success', accessToken })
})

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/send-otp        body: { email }
   POST /api/v1/auth/verify-otp      body: { email, code }
   Generates a 6-digit code, stores it on the user with a 10-min expiry.
   In dev/test the code is returned in the response so QA can verify without
   email infra. In production it should be sent via your mailer of choice.
   ───────────────────────────────────────────────────────────────────────────── */
exports.sendOtp = catchAsync(async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase()
  if (!email) return next(new AppError('Email is required.', 400))

  const user = await User.findOne({ email })
  if (!user) return next(new AppError('No account with that email.', 404))

  const code = String(Math.floor(100000 + Math.random() * 900000))
  user.otp = { code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  await user.save({ validateBeforeSave: false })

  // TODO: integrate mail provider. For now log + (dev only) return.
  console.log(`[OTP] ${email} → ${code}`)

  const payload = { status: 'success', message: 'OTP sent.' }
  if (process.env.NODE_ENV !== 'production') payload.devCode = code
  res.status(200).json(payload)
})

exports.verifyOtp = catchAsync(async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const { code } = req.body
  if (!email || !code) return next(new AppError('Email and code are required.', 400))

  const user = await User.findOne({ email }).select('+otp.code +otp.expiresAt')
  if (!user || !user.otp?.code) return next(new AppError('Invalid or expired code.', 400))
  if (user.otp.expiresAt < new Date()) return next(new AppError('Code has expired.', 400))
  if (user.otp.code !== code)          return next(new AppError('Incorrect code.', 400))

  user.isEmailVerified = true
  user.otp = { code: undefined, expiresAt: undefined }
  await user.save({ validateBeforeSave: false })

  res.status(200).json({ status: 'success', message: 'Email verified.' })
})

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/v1/auth/forgot-password   body: { email }
   POST /api/v1/auth/reset-password/:token   body: { newPassword }
   ───────────────────────────────────────────────────────────────────────────── */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase()
  if (!email) return next(new AppError('Email is required.', 400))

  const user = await User.findOne({ email })
  // Don't reveal whether the email exists — respond uniformly.
  if (!user) {
    return res.status(200).json({ status: 'success', message: 'If the email exists, a reset link has been sent.' })
  }

  const rawToken    = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

  user.passwordResetToken   = hashedToken
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)   // 1 hour
  await user.save({ validateBeforeSave: false })

  // TODO: email rawToken via a link like https://app/reset/<rawToken>
  console.log(`[RESET] ${email} → ${rawToken}`)

  const payload = { status: 'success', message: 'If the email exists, a reset link has been sent.' }
  if (process.env.NODE_ENV !== 'production') payload.devToken = rawToken
  res.status(200).json(payload)
})

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { newPassword } = req.body
  if (!newPassword || newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters.', 400))
  }

  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex')
  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password')
  if (!user) return next(new AppError('Reset link is invalid or has expired.', 400))

  user.password             = newPassword
  user.passwordResetToken   = undefined
  user.passwordResetExpires = undefined
  await user.save()

  res.status(200).json({ status: 'success', message: 'Password reset successful. Please log in.' })
})
