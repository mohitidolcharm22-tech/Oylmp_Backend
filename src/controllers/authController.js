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
  const user = await User.findById(req.user.id).populate('teacherBadges.awardedBy', 'name')
  res.status(200).json({ status: 'success', data: { user } })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/auth/users  — Admin: list all users
   ───────────────────────────────────────────────────────────────────────────── */
exports.listUsers = catchAsync(async (req, res) => {
  const { role, search } = req.query
  const filter = {}
  if (role) filter.role = role
  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200)
  res.status(200).json({ status: 'success', results: users.length, data: { users } })
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
