const Quiz        = require('../models/Quiz')
const Lesson      = require('../models/Lesson')
const User        = require('../models/User')
const Subject     = require('../models/Subject')
const QuizAttempt = require('../models/QuizAttempt')
const Feedback    = require('../models/Feedback')
const AppError    = require('../utils/AppError')
const catchAsync  = require('../utils/catchAsync')

/* ════════════════════════════════════════════════════════════════════════
   MODERATION
   ════════════════════════════════════════════════════════════════════════ */

/* GET /api/v1/admin/moderation?status=pending|approved|rejected|all&type=quiz|lesson|all
 * Returns Quiz + Lesson items merged into a single feed, newest first.
 */
exports.listModeration = catchAsync(async (req, res) => {
  const status = req.query.status || 'pending'
  const type   = req.query.type   || 'all'

  const filter = {}
  if (status !== 'all') filter.moderationStatus = status

  // Scope to school: super_admin sees all; school_admin/admin see their school only
  if (req.user.role !== 'super_admin' && req.user.schoolId) {
    filter.schoolId = req.user.schoolId
  }

  const promises = []
  if (type === 'all' || type === 'quiz') {
    promises.push(
      Quiz.find(filter)
        .select('title icon difficulty grade moderationStatus moderationNote moderatedAt subjectId topicId createdBy createdAt isActive questions')
        .populate('subjectId', 'name icon')
        .populate('topicId',   'name icon')
        .populate('createdBy', 'name email role')
        .populate('moderatedBy', 'name')
        .sort({ createdAt: -1 })
        .lean()
        .then(docs => docs.map(d => ({
          ...d,
          kind: 'quiz',
          totalQuestions: (d.questions || []).length,
          questions: undefined,
        }))),
    )
  } else {
    promises.push(Promise.resolve([]))
  }

  if (type === 'all' || type === 'lesson') {
    promises.push(
      Lesson.find(filter)
        .select('title type duration xp moderationStatus moderationNote moderatedAt subjectId topicId createdBy createdAt isActive content keyPoints')
        .populate('subjectId', 'name icon')
        .populate('topicId',   'name icon')
        .populate('createdBy', 'name email role')
        .populate('moderatedBy', 'name')
        .sort({ createdAt: -1 })
        .lean()
        .then(docs => docs.map(d => ({ ...d, kind: 'lesson' }))),
    )
  } else {
    promises.push(Promise.resolve([]))
  }

  const [quizzes, lessons] = await Promise.all(promises)
  const items = [...quizzes, ...lessons].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )
  res.status(200).json({ status: 'success', results: items.length, data: { items } })
})

/* GET /api/v1/admin/moderation/:kind/:id  — full detail for the View dialog */
exports.getModerationItem = catchAsync(async (req, res, next) => {
  const { kind, id } = req.params
  const Model = kind === 'quiz' ? Quiz : kind === 'lesson' ? Lesson : null
  if (!Model) return next(new AppError('Unknown content kind.', 400))

  const item = await Model.findById(id)
    .populate('subjectId', 'name icon color')
    .populate('topicId',   'name icon')
    .populate('createdBy', 'name email role')
    .populate('moderatedBy', 'name')
    .lean()
  if (!item) return next(new AppError(`${kind} not found.`, 404))

  res.status(200).json({ status: 'success', data: { item: { ...item, kind } } })
})

/* PATCH /api/v1/admin/moderation/:kind/:id  body: { status: 'approved'|'rejected', note? } */
exports.moderateItem = catchAsync(async (req, res, next) => {
  const { kind, id } = req.params
  const { status, note } = req.body

  if (!['approved', 'rejected'].includes(status)) {
    return next(new AppError('status must be "approved" or "rejected".', 400))
  }

  const Model = kind === 'quiz' ? Quiz : kind === 'lesson' ? Lesson : null
  if (!Model) return next(new AppError('Unknown content kind.', 400))

  const update = {
    moderationStatus: status,
    moderatedBy: req.user._id,
    moderatedAt: new Date(),
    moderationNote: note || '',
  }
  const item = await Model.findByIdAndUpdate(id, update, { new: true })
    .populate('createdBy', 'name email')
  if (!item) return next(new AppError(`${kind} not found.`, 404))

  res.status(200).json({ status: 'success', data: { item } })
})

/* ════════════════════════════════════════════════════════════════════════
   PLATFORM STATS  — GET /api/v1/admin/stats
   ════════════════════════════════════════════════════════════════════════ */
exports.getStats = catchAsync(async (req, res) => {
  // Scope: super_admin sees global stats; others see their school only
  const isSuperAdmin = req.user.role === 'super_admin'
  const schoolMatch  = (!isSuperAdmin && req.user.schoolId)
    ? { schoolId: req.user.schoolId }
    : {}

  // Run all aggregations in parallel.
  const [
    userByRole,
    quizCounts,
    lessonCount,
    attemptStats,
    monthlyActive,
    subjectEngagement,
    feedbackByCategory,
    pendingCount,
  ] = await Promise.all([
    // Users grouped by role + active count
    User.aggregate([
      { $match: schoolMatch },
      { $group: { _id: '$role', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]),

    // Quiz counts by moderation status
    Quiz.aggregate([
      { $match: { isActive: true, ...schoolMatch } },
      { $group: { _id: '$moderationStatus', count: { $sum: 1 } } },
    ]),

    Lesson.countDocuments({ isActive: true, ...schoolMatch }),

    // Total attempts + avg score (QuizAttempt has no schoolId — join via quiz)
    QuizAttempt.aggregate([
      { $group: { _id: null, count: { $sum: 1 }, avgScore: { $avg: '$score' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),

    // Active users by month for the last 6 months (uses lastActiveDate)
    User.aggregate([
      { $match: {
          lastActiveDate: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180) },
          ...schoolMatch,
      }},
      { $project: {
          role: 1,
          month: { $dateToString: { format: '%Y-%m', date: '$lastActiveDate' } },
      }},
      { $group: { _id: { month: '$month', role: '$role' }, count: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]),

    // Attempts grouped by subject (via quiz lookup) — proxy for engagement
    QuizAttempt.aggregate([
      { $lookup: { from: 'quizzes', localField: 'quizId', foreignField: '_id', as: 'quiz' } },
      { $unwind: '$quiz' },
      { $lookup: { from: 'subjects', localField: 'quiz.subjectId', foreignField: '_id', as: 'subject' } },
      { $unwind: '$subject' },
      { $group: { _id: '$subject.name', attempts: { $sum: 1 }, avgScore: { $avg: '$score' } } },
      { $project: { _id: 0, subject: '$_id', attempts: 1, avgScore: { $round: ['$avgScore', 0] } } },
      { $sort: { attempts: -1 } },
    ]),

    Feedback.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),

    Quiz.countDocuments({ moderationStatus: 'pending' })
      .then(qc => Lesson.countDocuments({ moderationStatus: 'pending' }).then(lc => qc + lc)),
  ])

  const userTotals = userByRole.reduce((acc, r) => {
    acc[r._id] = r.total
    acc[`${r._id}Active`] = r.active
    return acc
  }, {})
  const totalUsers      = (userTotals.student || 0) + (userTotals.teacher || 0) + (userTotals.parent || 0) + (userTotals.admin || 0)
  const totalActiveUsers= (userTotals.studentActive || 0) + (userTotals.teacherActive || 0) + (userTotals.parentActive || 0) + (userTotals.adminActive || 0)

  const quizByStatus = quizCounts.reduce((acc, r) => {
    acc[r._id || 'approved'] = r.count
    return acc
  }, {})

  const attempt = attemptStats[0] || { count: 0, avgScore: 0, passed: 0 }
  const passRate = attempt.count ? Math.round((attempt.passed / attempt.count) * 100) : 0

  res.status(200).json({
    status: 'success',
    data: {
      users: {
        total:    totalUsers,
        student:  userTotals.student   || 0,
        teacher:  userTotals.teacher   || 0,
        parent:   userTotals.parent    || 0,
        admin:    userTotals.admin     || 0,
        active:   totalActiveUsers,
      },
      content: {
        quizzesTotal:    (quizByStatus.approved || 0) + (quizByStatus.pending || 0) + (quizByStatus.rejected || 0),
        quizzesApproved: quizByStatus.approved || 0,
        quizzesPending:  quizByStatus.pending  || 0,
        quizzesRejected: quizByStatus.rejected || 0,
        lessons:         lessonCount,
        pendingTotal:    pendingCount,
      },
      attempts: {
        total:    attempt.count,
        avgScore: Math.round(attempt.avgScore || 0),
        passed:   attempt.passed,
        passRate,
      },
      monthlyActive,
      subjectEngagement,
      feedbackByCategory: feedbackByCategory.map(f => ({ category: f._id || 'Other', count: f.count })),
    },
  })
})
