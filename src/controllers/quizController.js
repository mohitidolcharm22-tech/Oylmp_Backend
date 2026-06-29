const Quiz        = require('../models/Quiz')
const QuizAttempt = require('../models/QuizAttempt')
const User        = require('../models/User')
const AppError    = require('../utils/AppError')
const catchAsync  = require('../utils/catchAsync')

/* ── GET /api/v1/quizzes ──────────────────────────────────────────────────── */
exports.getQuizzes = catchAsync(async (req, res) => {
  const filter = { isActive: true }
  if (req.query.subjectId)  filter.subjectId  = req.query.subjectId
  if (req.query.topicId)    filter.topicId    = req.query.topicId
  if (req.query.difficulty) filter.difficulty = req.query.difficulty
  if (req.query.grade)      filter.grade      = req.query.grade
  if (req.query.search) {
    filter.title = { $regex: req.query.search, $options: 'i' }
  }

  const rawQuizzes = await Quiz.find(filter)
    .populate('topicId',   'name icon')
    .populate('subjectId', 'name icon color')
    .sort({ createdAt: -1 })
    .lean()

  // Add totalQuestions count and strip the full questions array from the list view
  const quizzes = rawQuizzes.map(({ questions, ...rest }) => ({
    ...rest,
    totalQuestions: questions?.length || 0,
  }))

  res.status(200).json({ status: 'success', results: quizzes.length, data: { quizzes } })
})

/* ── GET /api/v1/quizzes/:id ─────────────────────────────────────────────── */
exports.getQuiz = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('topicId',   'name icon')
    .populate('subjectId', 'name icon color')

  if (!quiz || !quiz.isActive) return next(new AppError('Quiz not found.', 404))

  // Strip correct answers from questions before sending to student
  const role = req.user?.role
  if (role === 'student') {
    const sanitised = quiz.toObject()
    sanitised.questions = sanitised.questions.map(q => {
      const { correctAnswer, explanation, ...rest } = q
      return rest
    })
    return res.status(200).json({ status: 'success', data: { quiz: sanitised } })
  }

  res.status(200).json({ status: 'success', data: { quiz } })
})

/* ── POST /api/v1/quizzes  (teacher / admin) ─────────────────────────────── */
exports.createQuiz = catchAsync(async (req, res) => {
  const quiz = await Quiz.create({ ...req.body, createdBy: req.user._id })
  res.status(201).json({ status: 'success', data: { quiz } })
})

/* ── PATCH /api/v1/quizzes/:id ───────────────────────────────────────────── */
exports.updateQuiz = catchAsync(async (req, res, next) => {
  // Prevent editing a quiz that has attempts
  const attempts = await QuizAttempt.countDocuments({ quizId: req.params.id })
  if (attempts > 0) {
    return next(new AppError('This quiz has been attempted and cannot be edited.', 409))
  }
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!quiz) return next(new AppError('Quiz not found.', 404))
  res.status(200).json({ status: 'success', data: { quiz } })
})

/* ── DELETE /api/v1/quizzes/:id (soft delete) ────────────────────────────── */
exports.deleteQuiz = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
  if (!quiz) return next(new AppError('Quiz not found.', 404))
  res.status(204).json({ status: 'success', data: null })
})

/* ── Grading helper ───────────────────────────────────────────────────────── */
function gradeAnswer(q, submitted) {
  const sel = submitted?.selected || ''
  switch (q.type) {
    case 'truefalse':
    case 'mcq':
    case 'oddoneout':
    case 'imagemcq':
      return sel === q.correctAnswer
    case 'fillinblank':
      return sel.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase()
    case 'matching': {
      // submitted.selected is JSON: [{left,right}]
      try {
        const given   = JSON.parse(sel)
        const correct = q.pairs.map(p => p.right)
        const givenR  = q.pairs.map(p => given.find(g => g.left === p.left)?.right || '')
        return JSON.stringify(givenR) === JSON.stringify(correct)
      } catch { return false }
    }
    case 'sequence': {
      try {
        const given = JSON.parse(sel)  // submitted order array
        return JSON.stringify(given) === JSON.stringify(q.correctOrder)
      } catch { return false }
    }
    case 'flashcard':
      return true  // flashcards are self-assessed; always award points
    default:
      return sel === q.correctAnswer
  }
}

/* ── POST /api/v1/quizzes/:id/submit ─────────────────────────────────────── */
exports.submitQuiz = catchAsync(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id)
  if (!quiz || !quiz.isActive) return next(new AppError('Quiz not found.', 404))

  // Only one attempt per student per quiz
  const existing = await QuizAttempt.findOne({ userId: req.user._id, quizId: quiz._id })
  if (existing) {
    return next(new AppError('You have already attempted this quiz.', 409))
  }

  const { answers = [], timeTaken } = req.body

  // Grade the answers
  let totalPoints = 0
  let earnedPoints = 0
  const gradedAnswers = quiz.questions.map(q => {
    totalPoints += q.points
    const submitted = answers.find(a => a.questionId === String(q._id))
    const correct = gradeAnswer(q, submitted)
    if (correct) earnedPoints += q.points
    return { questionId: String(q._id), selected: submitted?.selected || '', correct }
  })

  const score    = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
  const passed   = score >= quiz.passingScore
  const xpEarned = passed ? quiz.xpReward : Math.round(quiz.xpReward * 0.2)

  const attempt = await QuizAttempt.create({
    userId: req.user._id,
    quizId: quiz._id,
    answers: gradedAnswers,
    score,
    xpEarned,
    passed,
    timeTaken,
  })

  // Update student XP & stats — recalculate avgScore from all attempts
  const allAttempts = await QuizAttempt.find({ userId: req.user._id })
  const avgScore = allAttempts.length
    ? Math.round(allAttempts.reduce((s, a) => s + a.score, 0) / allAttempts.length)
    : score

  await User.findByIdAndUpdate(req.user._id, {
    $inc: { xp: xpEarned, 'stats.quizzesTaken': 1 },
    $set: { 'stats.avgScore': avgScore },
  })

  // Return full quiz with explanations for result page
  res.status(200).json({
    status: 'success',
    data: {
      attempt,
      score,
      passed,
      xpEarned,
      quiz: {
        title: quiz.title,
        passingScore: quiz.passingScore,
        questions: quiz.questions,   // includes correctAnswer + explanation
      },
    },
  })
})

/* ── GET /api/v1/quizzes/:id/result ──────────────────────────────────────── */
exports.getQuizResult = catchAsync(async (req, res, next) => {
  const attempt = await QuizAttempt.findOne({ userId: req.user._id, quizId: req.params.id })
    .populate('quizId')
  if (!attempt) return next(new AppError('No attempt found for this quiz.', 404))
  res.status(200).json({ status: 'success', data: { attempt } })
})

/* ── GET /api/v1/quizzes/leaderboard ─────────────────────────────────────── */
exports.getLeaderboard = catchAsync(async (req, res) => {
  const leaders = await User.find({ role: 'student', isActive: true })
    .select('name xp level avatarColor stats streak')
    .sort({ xp: -1 })
    .limit(50)
    .lean()

  const ranked = leaders.map((u, i) => ({ ...u, rank: i + 1 }))
  res.status(200).json({ status: 'success', results: ranked.length, data: { leaderboard: ranked } })
})

/* ── GET /api/v1/quizzes/my-attempts  (student) ──────────────────────────── */
exports.getMyAttempts = catchAsync(async (req, res) => {
  const attempts = await QuizAttempt.find({ userId: req.user._id })
    .populate({ path: 'quizId', select: 'title icon difficulty xpReward subjectId topicId', populate: { path: 'topicId', select: '_id name' } })
    .sort({ completedAt: -1 })
    .lean()
  res.status(200).json({ status: 'success', results: attempts.length, data: { attempts } })
})

/* ── GET /api/v1/quizzes/:quizId/attempts  (teacher — all students) ──────── */
exports.getQuizAttempts = catchAsync(async (req, res) => {
  const attempts = await QuizAttempt.find({ quizId: req.params.id })
    .populate('userId', 'name email grade avatarColor')
    .sort({ completedAt: -1 })
    .lean()
  res.status(200).json({ status: 'success', results: attempts.length, data: { attempts } })
})
