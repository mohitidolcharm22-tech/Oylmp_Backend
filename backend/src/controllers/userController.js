const Notification = require('../models/Notification')
const Feedback     = require('../models/Feedback')
const User         = require('../models/User')
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

  const stats = {
    total:    feedback.length,
    open:     feedback.filter(f => f.status === 'open').length,
    resolved: feedback.filter(f => f.status === 'resolved').length,
    avgRating: feedback.filter(f => f.rating).reduce((s, f, _, a) => s + f.rating / a.filter(x => x.rating).length, 0) || 0,
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
  const QuizAttempt = require('../models/QuizAttempt')
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
  const QuizAttempt = require('../models/QuizAttempt')

  const user = await User.findById(req.params.id)
    .select('name xp level streak stats badges teacherBadges role')
    .populate('teacherBadges.awardedBy', 'name')
  if (!user) return next(new AppError('User not found.', 404))

  const attempts = await QuizAttempt.find({ userId: req.params.id })
    .populate('quizId', 'title subjectId difficulty xpReward')
    .sort({ completedAt: -1 })
    .lean()

  res.status(200).json({ status: 'success', data: { user, attempts } })
})

/* ─────────────────────────── STUDENTS LIST (teacher/admin) ─────────────── */

/* GET /api/v1/users/students */
exports.getStudents = catchAsync(async (req, res) => {
  const QuizAttempt = require('../models/QuizAttempt')

  const students = await User.find({ role: 'student', isActive: true })
    .select('name email username grade xp level streak stats avatarColor badges teacherBadges createdAt')
    .populate('teacherBadges.awardedBy', 'name')
    .sort({ xp: -1 })
    .lean()

  // Attach attempt count for each student
  const attemptCounts = await QuizAttempt.aggregate([
    { $group: { _id: '$userId', count: { $sum: 1 }, avgScore: { $avg: '$score' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
  ])
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
  const QuizAttempt = require('../models/QuizAttempt')

  const parent = await User.findById(req.user._id).populate('children', 'name email grade xp level streak stats avatarColor badges teacherBadges')
  if (!parent) return res.status(200).json({ status: 'success', data: { children: [] } })

  const childrenData = await Promise.all(
    (parent.children || []).map(async child => {
      const childWithBadges = await User.findById(child._id)
        .select('name email grade xp level streak stats avatarColor badges teacherBadges')
        .populate('teacherBadges.awardedBy', 'name')
        .lean()
      const attempts = await QuizAttempt.find({ userId: child._id })
        .populate('quizId', 'title subjectId difficulty xpReward passingScore')
        .sort({ completedAt: -1 })
        .limit(10)
        .lean()
      return { ...childWithBadges, recentAttempts: attempts }
    })
  )

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
