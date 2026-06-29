const Subject = require('../models/Subject')
const Topic   = require('../models/Topic')
const Lesson  = require('../models/Lesson')
const Quiz    = require('../models/Quiz')
const User        = require('../models/User')
const AppError    = require('../utils/AppError')
const catchAsync  = require('../utils/catchAsync')

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

  // Attach lesson count per topic
  const lessonCounts = await Lesson.aggregate([
    { $match: { topicId: { $in: topics.map(t => t._id) }, isActive: true } },
    { $group: { _id: '$topicId', count: { $sum: 1 } } },
  ])
  const countMap = Object.fromEntries(lessonCounts.map(x => [x._id.toString(), x.count]))
  const topicsWithCount = topics.map(t => ({ ...t, lessonCount: countMap[t._id.toString()] || 0 }))

  res.status(200).json({ status: 'success', results: topicsWithCount.length, data: { topics: topicsWithCount } })
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
exports.completeLesson = catchAsync(async (req, res) => {
  const lessonId = req.params.id
  const lesson = await Lesson.findById(lessonId)
  if (!lesson) return res.status(404).json({ status: 'fail', message: 'Lesson not found' })

  const user = await User.findById(req.user._id)
  const alreadyDone = user.completedLessons.some(id => id.toString() === lessonId)

  if (!alreadyDone) {
    user.completedLessons.push(lessonId)
    user.stats.lessonsCompleted = user.completedLessons.length
    await user.save({ validateBeforeSave: false })
  }

  res.status(200).json({
    status: 'success',
    data: { completedLessons: user.completedLessons },
  })
})
