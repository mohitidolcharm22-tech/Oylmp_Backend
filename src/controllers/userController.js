const Notification = require('../models/Notification')
const Feedback     = require('../models/Feedback')
const User         = require('../models/User')
const QuizAttempt  = require('../models/QuizAttempt')
const AppError     = require('../utils/AppError')
const catchAsync   = require('../utils/catchAsync')

/* ─────────────────────────── NOTIFICATIONS ──────────────────────────────── */

/* GET /api/v1/notifications */
exports.getNotifications = catchAsync(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
  const unreadCount = notifications.filter(n => !n.isRead).length
  res.status(200).json({ status: 'success', unreadCount, data: { notifications } })
})

/* PATCH /api/v1/notifications/:id/read */
exports.markRead = catchAsync(async (req, res, next) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isRead: true },
    { new: true },
  )
  if (!n) return next(new AppError('Notification not found.', 404))
  res.status(200).json({ status: 'success', data: { notification: n } })
})

/* PATCH /api/v1/notifications/mark-all-read */
exports.markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true })
  res.status(200).json({ status: 'success', message: 'All notifications marked as read.' })
})

/* ─────────────────────────────── FEEDBACK ───────────────────────────────── */

/* POST /api/v1/feedback */
exports.createFeedback = catchAsync(async (req, res) => {
  const { comment, description, category, rating, title } = req.body
  const feedback = await Feedback.create({
    category: category || 'general',
    rating,
    title:   title || category || 'Feedback',
    comment: comment || description || '',
    userId:  req.user._id,
    role:    req.user.role,
  })
  res.status(201).json({ status: 'success', data: { feedback } })
})

/* GET /api/v1/feedback  (admin only) */
exports.getFeedback = catchAsync(async (req, res) => {
  const filter = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.status)   filter.status   = req.query.status
  if (req.query.role)     filter.role     = req.query.role

  const feedback = await Feedback.find(filter)
    .populate('userId', 'name email role')
    .sort({ createdAt: -1 })
    .lean()

  // Compute stats in a single pass (was O(n²) — filter().length was called
  // inside every reduce step).
  let open = 0, resolved = 0, ratingSum = 0, ratingCount = 0
  for (const f of feedback) {
    if (f.status === 'open')     open++
    if (f.status === 'resolved') resolved++
    if (f.rating) { ratingSum += f.rating; ratingCount++ }
  }
  const stats = {
    total:     feedback.length,
    open,
    resolved,
    avgRating: ratingCount ? ratingSum / ratingCount : 0,
  }

  res.status(200).json({ status: 'success', data: { feedback, stats } })
})

/* PATCH /api/v1/feedback/:id  (admin: update status / notes) */
exports.updateFeedback = catchAsync(async (req, res, next) => {
  const allowed = ['status', 'adminNotes']
  const updates = {}
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k] })

  const feedback = await Feedback.findByIdAndUpdate(req.params.id, updates, { new: true })
  if (!feedback) return next(new AppError('Feedback not found.', 404))
  res.status(200).json({ status: 'success', data: { feedback } })
})

/* ──────────────────────── STUDENT PROGRESS / PROFILE ───────────────────── */

/* GET /api/v1/users/me/progress */
exports.getStudentProgress = catchAsync(async (req, res, next) => {
  const userId = req.user._id

  const user = await User.findById(userId)
    .select('name xp level streak stats badges teacherBadges lastActiveDate completedLessons')
    .populate('teacherBadges.awardedBy', 'name')
  if (!user) return next(new AppError('User not found.', 404))

  const attempts = await QuizAttempt.find({ userId })
    .populate('quizId', 'title subjectId difficulty xpReward')
    .sort({ completedAt: -1 })
    .limit(20)
    .lean()

  res.status(200).json({ status: 'success', data: { user, recentAttempts: attempts } })
})

/* GET /api/v1/users/:id/progress  (parent/teacher/admin) */
exports.getStudentProgressById = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('name xp level streak stats badges teacherBadges role grade classIds')
    .populate('teacherBadges.awardedBy', 'name')
    .populate('classIds', 'name grade section')
    .lean()
  if (!user) return next(new AppError('User not found.', 404))

  // Scope checks — admin sees all; teacher must share a class; parent must own.
  if (req.user.role === 'teacher') {
    const teacherClasses = (req.user.classIds || []).map(String)
    const studentClasses = (user.classIds || []).map(c => String(c._id || c))
    const shared = teacherClasses.some(c => studentClasses.includes(c))
    if (!shared) return next(new AppError('You can only view progress for students in your classes.', 403))
  } else if (req.user.role === 'parent') {
    const childIds = (req.user.children || []).map(String)
    if (!childIds.includes(String(user._id))) {
      return next(new AppError('You can only view progress for your own children.', 403))
    }
  }

  const attempts = await QuizAttempt.find({ userId: req.params.id })
    .populate('quizId', 'title subjectId difficulty xpReward')
    .sort({ completedAt: -1 })
    .lean()

  res.status(200).json({ status: 'success', data: { user, attempts } })
})

/* ─────────────────────────── STUDENTS LIST (teacher/admin) ─────────────── */

/* GET /api/v1/users/students */
// Teachers see only students enrolled in their classes. Admins see all.
// Optional ?classId=... narrows further (must still pass the ownership check
// for teachers).
exports.getStudents = catchAsync(async (req, res) => {
  const filter = { role: 'student', isActive: true }

  // When `available=true`, teachers can see every active student so they can
  // pick them into a class roster. Without this flag the default behaviour
  // stays scoped to "students in my classes".
  const available = req.query.available === 'true' || req.query.available === true

  if (req.user.role === 'teacher' && !available) {
    const teacherClassIds = req.user.classIds || []
    filter.classIds = { $in: teacherClassIds }
  }
  if (req.query.classId) {
    if (req.user.role === 'teacher') {
      const teacherClassIds = (req.user.classIds || []).map(String)
      if (!teacherClassIds.includes(String(req.query.classId))) {
        return res.status(200).json({ status: 'success', results: 0, data: { students: [] } })
      }
    }
    filter.classIds = req.query.classId
  }
  if (req.query.grade) filter.grade = String(req.query.grade)

  const students = await User.find(filter)
    .select('name email username grade xp level streak stats avatarColor badges teacherBadges classIds createdAt')
    .populate('classIds', 'name grade section')
    .sort({ xp: -1 })
    .lean()

  // Attach attempt count for each student. Scope the aggregation to JUST these
  // student IDs so the database doesn't scan the whole QuizAttempt collection.
  const studentIds = students.map(s => s._id)
  const attemptCounts = studentIds.length
    ? await QuizAttempt.aggregate([
        { $match: { userId: { $in: studentIds } } },
        { $group: {
            _id: '$userId',
            count: { $sum: 1 },
            avgScore: { $avg: '$score' },
            passed: { $sum: { $cond: ['$passed', 1, 0] } },
          } },
      ])
    : []
  const countMap = {}
  attemptCounts.forEach(a => { countMap[String(a._id)] = a })

  const enriched = students.map(s => ({
    ...s,
    quizzesTaken: countMap[String(s._id)]?.count  || 0,
    avgScore:     Math.round(countMap[String(s._id)]?.avgScore || 0),
    quizzesPassed: countMap[String(s._id)]?.passed || 0,
  }))

  res.status(200).json({ status: 'success', results: enriched.length, data: { students: enriched } })
})

/* ─────────────────────────── PARENT: MY CHILDREN ───────────────────────── */

/* GET /api/v1/users/my-children */
exports.getMyChildren = catchAsync(async (req, res) => {
  const parent = await User.findById(req.user._id).select('children').lean()
  const childIds = (parent?.children || []).map(id => id)
  if (!childIds.length) return res.status(200).json({ status: 'success', data: { children: [] } })

  // Fetch all children + all recent attempts in TWO queries (was N+1: 2 per child).
  const [children, allAttempts] = await Promise.all([
    User.find({ _id: { $in: childIds } })
      .select('name email grade xp level streak stats avatarColor badges teacherBadges')
      .populate('teacherBadges.awardedBy', 'name')
      .lean(),
    QuizAttempt.find({ userId: { $in: childIds } })
      .populate('quizId', 'title subjectId difficulty xpReward passingScore')
      .sort({ completedAt: -1 })
      .lean(),
  ])

  // Group attempts by userId and keep the last 10 each.
  const attemptsByUser = new Map()
  for (const a of allAttempts) {
    const key = String(a.userId)
    const list = attemptsByUser.get(key) || []
    if (list.length < 10) list.push(a)
    attemptsByUser.set(key, list)
  }

  const childrenData = children.map(c => ({
    ...c,
    recentAttempts: attemptsByUser.get(String(c._id)) || [],
  }))

  res.status(200).json({ status: 'success', data: { children: childrenData } })
})

/* POST /api/v1/users/link-child  (parent links a student by email) */
exports.linkChild = catchAsync(async (req, res, next) => {
  const { childEmail, childUsername } = req.body
  const identifier = (childUsername || childEmail || '').trim().toLowerCase()
  if (!identifier) return next(new AppError('childUsername is required.', 400))

  const child = await User.findOne({
    role: 'student',
    $or: [{ username: identifier }, { email: identifier }],
  })
  if (!child) return next(new AppError('No student found with that username.', 404))

  await User.findByIdAndUpdate(req.user._id, { $addToSet: { children: child._id } })

  res.status(200).json({
    status: 'success',
    message: `${child.name} linked successfully.`,
    data: { child: { _id: child._id, name: child.name, grade: child.grade, email: child.email } },
  })
})

/* POST /api/v1/users/:id/badges — teacher/admin awards a badge to a student */
exports.awardBadge = catchAsync(async (req, res, next) => {
  const { badge, note } = req.body
  if (!badge) return next(new AppError('badge is required.', 400))

  const student = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'student' },
    {
      $addToSet: { badges: badge },
      $push: {
        teacherBadges: {
          badgeId:   badge,
          awardedBy: req.user._id,
          awardedAt: new Date(),
          note:      note || '',
        },
      },
    },
    { new: true, select: 'name badges teacherBadges' }
  )
  if (!student) return next(new AppError('Student not found.', 404))

  res.status(200).json({ status: 'success', data: { student } })
})

/* DELETE /api/v1/users/:id/badges/:badgeId — teacher/admin revokes a badge */
exports.revokeBadge = catchAsync(async (req, res, next) => {
  const student = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'student' },
    {
      $pull: {
        badges: req.params.badgeId,
        teacherBadges: { badgeId: req.params.badgeId },
      },
    },
    { new: true, select: 'name badges teacherBadges' }
  )
  if (!student) return next(new AppError('Student not found.', 404))
  res.status(200).json({ status: 'success', data: { student } })
})
