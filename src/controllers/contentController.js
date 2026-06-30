const Subject = require('../models/Subject')
const Topic   = require('../models/Topic')
const Lesson  = require('../models/Lesson')
const Quiz    = require('../models/Quiz')
const User        = require('../models/User')
const QuizAttempt = require('../models/QuizAttempt')
const AppError    = require('../utils/AppError')
const catchAsync  = require('../utils/catchAsync')
const { notify }  = require('../utils/notify')
const { updateStreak, evaluateRules, awardBadges } = require('../utils/gamification')

/* ── GET /api/v1/subjects ──────────────────────────────────────────────────── */
exports.getSubjects = catchAsync(async (req, res) => {
  const filter = { isActive: true }
  if (req.query.grade) filter.grades = req.query.grade

  const subjects = await Subject.find(filter).sort('order').lean()

  // Attach real topic + quiz counts for each subject
  const subjectIds = subjects.map(s => s._id)
  const [topicCounts, quizCounts] = await Promise.all([
    Topic.aggregate([
      { $match: { subjectId: { $in: subjectIds }, isActive: true } },
      { $group: { _id: '$subjectId', count: { $sum: 1 } } },
    ]),
    Quiz.aggregate([
      { $match: { subjectId: { $in: subjectIds } } },
      { $group: { _id: '$subjectId', count: { $sum: 1 } } },
    ]),
  ])

  const topicMap = Object.fromEntries(topicCounts.map(t => [String(t._id), t.count]))
  const quizMap  = Object.fromEntries(quizCounts.map(q => [String(q._id), q.count]))

  const enriched = subjects.map(s => ({
    ...s,
    totalTopics:  topicMap[String(s._id)] ?? 0,
    totalQuizzes: quizMap[String(s._id)]  ?? 0,
  }))

  res.status(200).json({ status: 'success', results: enriched.length, data: { subjects: enriched } })
})

/* ── GET /api/v1/subjects/:id ─────────────────────────────────────────────── */
exports.getSubject = catchAsync(async (req, res, next) => {
  const subject = await Subject.findById(req.params.id)
  if (!subject) return next(new AppError('Subject not found.', 404))
  res.status(200).json({ status: 'success', data: { subject } })
})

/* ── POST /api/v1/subjects  (admin/teacher) ───────────────────────────────── */
exports.createSubject = catchAsync(async (req, res) => {
  const subject = await Subject.create(req.body)
  res.status(201).json({ status: 'success', data: { subject } })
})

/* ── PATCH /api/v1/subjects/:id ───────────────────────────────────────────── */
exports.updateSubject = catchAsync(async (req, res, next) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!subject) return next(new AppError('Subject not found.', 404))
  res.status(200).json({ status: 'success', data: { subject } })
})

/* ── GET /api/v1/subjects/:id/topics ─────────────────────────────────────── */
exports.getTopicsBySubject = catchAsync(async (req, res) => {
  const filter = { subjectId: req.params.id, isActive: true }
  if (req.query.grade) filter.grade = req.query.grade

  const topics = await Topic.find(filter).sort('order').lean()

  // Collect lesson IDs per topic so the client can detect 'all lessons done'.
  const lessons = await Lesson.find(
    { topicId: { $in: topics.map(t => t._id) }, isActive: true },
    { _id: 1, topicId: 1 },
  ).lean()
  const idMap = {}
  lessons.forEach(l => {
    const k = String(l.topicId)
    if (!idMap[k]) idMap[k] = []
    idMap[k].push(String(l._id))
  })

  const topicsEnriched = topics.map(t => {
    const ids = idMap[String(t._id)] || []
    return { ...t, lessonCount: ids.length, lessonIds: ids }
  })

  res.status(200).json({ status: 'success', results: topicsEnriched.length, data: { topics: topicsEnriched } })
})

/* ── GET /api/v1/topics/:id ───────────────────────────────────────────────── */
exports.getTopic = catchAsync(async (req, res, next) => {
  const topic = await Topic.findById(req.params.id).populate('subjectId', 'name icon color')
  if (!topic) return next(new AppError('Topic not found.', 404))
  res.status(200).json({ status: 'success', data: { topic } })
})

/* ── POST /api/v1/topics ──────────────────────────────────────────────────── */
exports.createTopic = catchAsync(async (req, res) => {
  const topic = await Topic.create(req.body)
  res.status(201).json({ status: 'success', data: { topic } })
})

/* ── PATCH /api/v1/topics/:id ─────────────────────────────────────────────── */
exports.updateTopic = catchAsync(async (req, res, next) => {
  const topic = await Topic.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!topic) return next(new AppError('Topic not found.', 404))
  res.status(200).json({ status: 'success', data: { topic } })
})

/* ── GET /api/v1/topics/:id/lessons ──────────────────────────────────────── */
exports.getLessonsByTopic = catchAsync(async (req, res) => {
  const lessons = await Lesson.find({ topicId: req.params.id, isActive: true }).sort('order').lean()
  res.status(200).json({ status: 'success', results: lessons.length, data: { lessons } })
})

/* ── GET /api/v1/lessons/:id ─────────────────────────────────────────────── */
exports.getLesson = catchAsync(async (req, res, next) => {
  const lesson = await Lesson.findById(req.params.id)
    .populate('topicId',   'name icon')
    .populate('subjectId', 'name icon color')
  if (!lesson) return next(new AppError('Lesson not found.', 404))
  res.status(200).json({ status: 'success', data: { lesson } })
})

/* ── POST /api/v1/lessons ─────────────────────────────────────────────────── */
exports.createLesson = catchAsync(async (req, res) => {
  const lesson = await Lesson.create({ ...req.body, createdBy: req.user._id })
  res.status(201).json({ status: 'success', data: { lesson } })
})

/* ── PATCH /api/v1/lessons/:id ───────────────────────────────────────────── */
exports.updateLesson = catchAsync(async (req, res, next) => {
  const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!lesson) return next(new AppError('Lesson not found.', 404))
  res.status(200).json({ status: 'success', data: { lesson } })
})

/* ── DELETE /api/v1/lessons/:id (soft delete) ────────────────────────────── */
exports.deleteLesson = catchAsync(async (req, res, next) => {
  const lesson = await Lesson.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
  if (!lesson) return next(new AppError('Lesson not found.', 404))
  res.status(204).json({ status: 'success', data: null })
})

/* ── POST /api/v1/lessons/:id/complete  (student marks lesson done) ──────── */
exports.completeLesson = catchAsync(async (req, res, next) => {
  const lessonId = req.params.id
  const lesson = await Lesson.findById(lessonId)
  if (!lesson) return next(new AppError('Lesson not found.', 404))

  const user = await User.findById(req.user._id)
  const alreadyDone = user.completedLessons.some(id => id.toString() === lessonId)

  let xpReward = 0
  if (!alreadyDone) {
    user.completedLessons.push(lessonId)
    user.stats.lessonsCompleted = user.completedLessons.length
    xpReward = lesson.xp || 0
    if (xpReward > 0) {
      user.xp = (user.xp || 0) + xpReward
      // Level up: 500 XP per level (matches the frontend formula).
      user.level = Math.max(1, Math.floor(user.xp / 500) + 1)
    }
    updateStreak(user)
    await user.save({ validateBeforeSave: false })

    await notify(user._id, {
      title:   'Lesson complete',
      message: `${lesson.title} (+${xpReward} XP)`,
      type:    'lesson',
      icon:    '📖',
      link:    `/lessons/${lesson._id}`,
    })
    const earned = await evaluateRules({ user, event: 'lesson_completed', lesson })
    await awardBadges(user, earned)
  }

  res.status(200).json({
    status: 'success',
    data: {
      alreadyDone,
      xpEarned: alreadyDone ? 0 : xpReward,
      streak:   user.streak,
      completedLessons: user.completedLessons,
      user: {
        xp:    user.xp,
        level: user.level,
        stats: user.stats,
        completedLessons: user.completedLessons,
      },
    },
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/users/me/next
   Returns the next incomplete lesson + next unattempted quiz for the student.
   Used by dashboards to render a "Continue learning" tile without the client
   having to walk every subject/topic.
   ───────────────────────────────────────────────────────────────────────────── */
exports.getNextUp = catchAsync(async (req, res) => {
  // protect() projects completedLessons off req.user — fetch just what we need.
  const me = await User.findById(req.user._id).select('grade completedLessons').lean()
  const completedSet = new Set((me?.completedLessons || []).map(String))
  const grade = me?.grade

  // Lessons in the student's grade, ordered by subject → topic → lesson order.
  const topicFilter = { isActive: true }
  if (grade) topicFilter.grade = grade

  const topics = await Topic.find(topicFilter).select('_id subjectId order').sort('order').lean()
  const topicIds = topics.map(t => t._id)

  const [allLessons, attempts, quizzes] = await Promise.all([
    Lesson.find({ topicId: { $in: topicIds }, isActive: true })
      .select('_id title topicId subjectId order icon xp duration')
      .sort('order')
      .lean(),
    QuizAttempt.find({ userId: req.user._id }).select('quizId').lean(),
    Quiz.find({
      isActive: true,
      ...(grade ? { $or: [{ grade }, { grade: { $exists: false } }, { grade: null }] } : {}),
    })
      .select('_id title icon difficulty topicId subjectId xpReward')
      .lean(),
  ])

  const nextLesson = allLessons.find(l => !completedSet.has(String(l._id))) || null

  const attemptedSet = new Set(attempts.map(a => String(a.quizId)))
  const nextQuiz = quizzes.find(q => !attemptedSet.has(String(q._id))) || null

  res.status(200).json({
    status: 'success',
    data: {
      nextLesson,
      nextQuiz,
      progress: {
        lessonsCompleted: completedSet.size,
        lessonsAvailable: allLessons.length,
        quizzesAttempted: attempts.length,
        quizzesAvailable: quizzes.length,
      },
    },
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/users/me/bookmarks
   ───────────────────────────────────────────────────────────────────────────── */
exports.getBookmarks = catchAsync(async (req, res) => {
  const me = await User.findById(req.user._id)
    .select('bookmarks')
    .populate({
      path:   'bookmarks',
      select: 'title icon difficulty xpReward subjectId topicId quizType',
      populate: [
        { path: 'subjectId', select: 'name icon color' },
        { path: 'topicId',   select: 'name icon' },
      ],
    })
    .lean()
  res.status(200).json({ status: 'success', data: { bookmarks: me?.bookmarks || [] } })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/search?q=...
   Cross-collection search over subjects, topics, lessons and quizzes.
   Caps each section at 10 to keep payload small.
   ───────────────────────────────────────────────────────────────────────────── */
exports.search = catchAsync(async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) {
    return res.status(200).json({ status: 'success', data: { subjects: [], topics: [], lessons: [], quizzes: [] } })
  }
  // Escape regex specials so user input "C++" or "1+1" doesn't blow up the regex.
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(safe, 'i')

  const [subjects, topics, lessons, quizzes] = await Promise.all([
    Subject.find({ isActive: true, name: rx }).select('name icon color').limit(10).lean(),
    Topic.find({ isActive: true, name: rx }).select('name icon subjectId').limit(10).lean(),
    Lesson.find({ isActive: true, title: rx }).select('title topicId subjectId icon').limit(10).lean(),
    Quiz.find({ isActive: true, title: rx }).select('title icon difficulty subjectId topicId').limit(10).lean(),
  ])

  res.status(200).json({ status: 'success', data: { subjects, topics, lessons, quizzes } })
})
