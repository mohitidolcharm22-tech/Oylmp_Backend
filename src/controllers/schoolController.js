const School     = require('../models/School')
const User       = require('../models/User')
const AppError   = require('../utils/AppError')
const catchAsync = require('../utils/catchAsync')

/* ── GET /api/v1/schools  [super_admin] ─────────────────────────────────────── */
exports.listSchools = catchAsync(async (req, res) => {
  const filter = {}
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true'
  if (req.query.search) {
    filter.$or = [
      { name:  { $regex: req.query.search, $options: 'i' } },
      { code:  { $regex: req.query.search, $options: 'i' } },
      { city:  { $regex: req.query.search, $options: 'i' } },
    ]
  }

  const page  = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const skip  = (page - 1) * limit

  const [schools, total] = await Promise.all([
    School.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    School.countDocuments(filter),
  ])

  // Attach per-school user counts
  const schoolIds = schools.map(s => s._id)
  const roleCounts = await User.aggregate([
    { $match: { schoolId: { $in: schoolIds } } },
    { $group: { _id: { school: '$schoolId', role: '$role' }, count: { $sum: 1 } } },
  ])
  const countMap = {}
  roleCounts.forEach(r => {
    const sk = String(r._id.school)
    if (!countMap[sk]) countMap[sk] = {}
    countMap[sk][r._id.role] = r.count
  })

  const enriched = schools.map(s => ({
    ...s,
    userCounts: countMap[String(s._id)] || {},
  }))

  res.status(200).json({
    status: 'success',
    results: enriched.length,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: { schools: enriched },
  })
})

/* ── GET /api/v1/schools/:id  [super_admin | school_admin of that school] ──── */
exports.getSchool = catchAsync(async (req, res, next) => {
  const school = await School.findById(req.params.id).lean()
  if (!school) return next(new AppError('School not found.', 404))

  // school_admin can only see their own school
  if (req.user.role === 'school_admin' && !req.user.schoolId?.equals(school._id)) {
    return next(new AppError('Access denied.', 403))
  }

  const counts = await User.aggregate([
    { $match: { schoolId: school._id } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ])
  school.userCounts = Object.fromEntries(counts.map(c => [c._id, c.count]))

  res.status(200).json({ status: 'success', data: { school } })
})

/* ── POST /api/v1/schools  [super_admin] ────────────────────────────────────── */
exports.createSchool = catchAsync(async (req, res, next) => {
  const { name, code, address, city, state, country, phone, email, logoUrl, timezone, meta } = req.body

  const existing = await School.findOne({ code: code?.toUpperCase() })
  if (existing) return next(new AppError(`A school with code "${code}" already exists.`, 409))

  const school = await School.create({
    name, code, address, city, state, country,
    phone, email, logoUrl, timezone, meta,
    createdBy: req.user._id,
  })
  res.status(201).json({ status: 'success', data: { school } })
})

/* ── PATCH /api/v1/schools/:id  [super_admin | school_admin] ────────────────── */
exports.updateSchool = catchAsync(async (req, res, next) => {
  // school_admin can update their own school only
  if (req.user.role === 'school_admin' && !req.user.schoolId?.equals(req.params.id)) {
    return next(new AppError('Access denied.', 403))
  }
  // Prevent code change via PATCH (immutable after creation)
  delete req.body.code

  const school = await School.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!school) return next(new AppError('School not found.', 404))
  res.status(200).json({ status: 'success', data: { school } })
})

/* ── PATCH /api/v1/schools/:id/toggle-status  [super_admin] ─────────────────── */
exports.toggleSchoolStatus = catchAsync(async (req, res, next) => {
  const school = await School.findById(req.params.id)
  if (!school) return next(new AppError('School not found.', 404))
  school.isActive = !school.isActive
  await school.save()
  res.status(200).json({
    status: 'success',
    message: `School has been ${school.isActive ? 'activated' : 'deactivated'}.`,
    data: { school },
  })
})

/* ── POST /api/v1/schools/:id/admins  [super_admin] ─────────────────────────── */
/* Promote an existing user to school_admin for this school */
exports.addSchoolAdmin = catchAsync(async (req, res, next) => {
  const { userId } = req.body
  const user = await User.findById(userId)
  if (!user) return next(new AppError('User not found.', 404))

  user.role     = 'school_admin'
  user.schoolId = req.params.id
  await user.save({ validateBeforeSave: false })

  res.status(200).json({ status: 'success', message: `${user.name} is now school admin.`, data: { user } })
})

/* ── POST /api/v1/schools/:id/admins/new  [super_admin] ──────────────────────── */
/* Create a brand-new school_admin account scoped to this school */
exports.createSchoolAdmin = catchAsync(async (req, res, next) => {
  const school = await School.findById(req.params.id)
  if (!school) return next(new AppError('School not found.', 404))

  const { name, email, password, phone } = req.body
  if (!name || !email || !password) {
    return next(new AppError('name, email and password are required.', 400))
  }
  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters.', 400))
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() })
  if (existing) return next(new AppError('An account with this email already exists.', 409))

  const user = await User.create({
    name:     name.trim(),
    email:    email.toLowerCase().trim(),
    password,
    role:     'school_admin',
    schoolId: school._id,
    isActive: true,
    ...(phone ? { phone } : {}),
  })

  user.password = undefined
  res.status(201).json({
    status: 'success',
    message: `Admin account created for ${school.name}.`,
    data: { user },
  })
})

/* ── GET /api/v1/schools/:id/admins  [super_admin] ──────────────────────────── */
/* List all school_admin users for a school */
exports.listSchoolAdmins = catchAsync(async (req, res, next) => {
  const school = await School.findById(req.params.id)
  if (!school) return next(new AppError('School not found.', 404))

  const admins = await User.find({
    schoolId: req.params.id,
    role: { $in: ['school_admin', 'admin'] },
  }).select('name email phone isActive createdAt role').lean()

  res.status(200).json({ status: 'success', results: admins.length, data: { admins } })
})
