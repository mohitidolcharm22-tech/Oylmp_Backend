const Quiz        = require('../models/Quiz')
const QuizAttempt = require('../models/QuizAttempt')
const User        = require('../models/User')
const Class       = require('../models/Class')
const { Types }   = require('mongoose')
const AppError    = require('../utils/AppError')
const catchAsync  = require('../utils/catchAsync')
const { notify }  = require('../utils/notify')
const { updateStreak, evaluateRules, awardBadges } = require('../utils/gamification')

// Fisher–Yates shuffle (in-place, returns the array).
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ── GET /api/v1/quizzes ──────────────────────────────────────────────────── */
exports.getQuizzes = catchAsync(async (req, res) => {
  console.log(req.query)
  const filter = { isActive: true }
  // aggregate() does NOT auto-cast strings → must use ObjectId explicitly
  if (req.query.subjectId)  filter.subjectId  = new Types.ObjectId(req.query.subjectId)
  if (req.query.topicId)    filter.topicId    = new Types.ObjectId(req.query.topicId)
  if (req.query.scope === 'general') { filter.topicId = null; filter.subjectId = null }
  if (req.query.difficulty) filter.difficulty = req.query.difficulty
  if (req.query.grade)      filter.grade      = req.query.grade
  if (req.query.search) {
    filter.title = { $regex: req.query.search, $options: 'i' }
  }

  // Scope to school: show quizzes that are school-private or global (null)
  if (req.user?.schoolId) {
    filter.$and = filter.$and || []
    filter.$and.push({ $or: [{ schoolId: null }, { schoolId: req.user.schoolId }] })
  }

  // Students/parents only see approved content. Teachers see their own
  // pending/rejected plus everyone's approved. Admins see all.
  const role = req.user?.role
  if (role === 'teacher') {
    filter.$or = [
      { moderationStatus: 'approved' },
      { createdBy: req.user._id },
    ]
  }

  // For students, restrict to quizzes that are either un-assigned (open) or
  // explicitly assigned to this user / their class. Teachers/admins see all.
  if (req.user?.role === 'student') {
    const classIds = req.user.classIds || []
    filter.$and = [
      { $or: [
        { assignedTo:       { $in: [req.user._id] } },
        { assignedTo:       { $size: 0 } },
      ]},
      { $or: [
        { assignedClassIds: { $in: classIds } },
        { assignedClassIds: { $size: 0 } },
      ]},
    ]
  }

  // Project away the heavy questions[] array — we only need its length.
  // Single aggregation: $addFields the count, $project drops questions, sort,
  // then mongoose.populate() resolves topic/subject refs on the plain docs.
  const rawQuizzes = await Quiz.aggregate([
    { $match: filter },
    { $addFields: { totalQuestions: { $size: { $ifNull: ['$questions', []] } } } },
    { $project: { questions: 0 } },
    { $sort: { createdAt: -1 } },
  ])
  await Quiz.populate(rawQuizzes, [
    { path: 'topicId',   select: 'name icon' },
    { path: 'subjectId', select: 'name icon color' },
  ])

  res.status(200).json({ status: 'success', results: rawQuizzes.length, data: { quizzes: rawQuizzes } })
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
    // Enforce class assignment: students outside the assigned classes can't fetch the quiz.
    if (quiz.assignedClassIds?.length) {
      const myClassIds = (req.user.classIds || []).map(String)
      const overlap = quiz.assignedClassIds.some(id => myClassIds.includes(String(id)))
      if (!overlap) return next(new AppError('Quiz not found.', 404))
    }

    const sanitised = quiz.toObject()
    let questions = sanitised.questions || []

    // Random-pick K-of-N when questionsToServe is set and smaller than the bank.
    const k = sanitised.questionsToServe
    if (k && k > 0 && k < questions.length) {
      questions = shuffle([...questions]).slice(0, k)
    }

    sanitised.questions = questions.map(q => {
      const { correctAnswer, explanation, ...rest } = q
      return rest
    })
    sanitised.totalQuestions = sanitised.questions.length

    // Lets the client skip a separate getMyAttempts round-trip when opening a quiz.
    const prior = await QuizAttempt.findOne({ userId: req.user._id, quizId: quiz._id }).select('_id').lean()
    sanitised.alreadyAttempted = !!prior

    return res.status(200).json({ status: 'success', data: { quiz: sanitised } })
  }

  res.status(200).json({ status: 'success', data: { quiz } })
})

/* ── POST /api/v1/quizzes  (teacher / admin) ─────────────────────────────── */
exports.createQuiz = catchAsync(async (req, res) => {
  // Teacher-authored content goes into the admin moderation queue.
  // Admin-authored content is auto-approved.
  const moderationStatus = req.user.role === 'teacher' ? 'pending' : 'approved'
  const quiz = await Quiz.create({
    ...req.body,
    createdBy: req.user._id,
    schoolId: req.user.schoolId || null,
    moderationStatus,
    moderatedBy: moderationStatus === 'approved' ? req.user._id : undefined,
    moderatedAt: moderationStatus === 'approved' ? new Date() : undefined,
  })
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

  // Test quizzes are one-shot. Practice & flashcard quizzes are retake-able:
  // we just replace the previous attempt so stats stay clean.
  const existing = await QuizAttempt.findOne({ userId: req.user._id, quizId: quiz._id })
  if (existing) {
    if (quiz.quizType === 'test') {
      return next(new AppError('You have already attempted this quiz.', 409))
    }
    await QuizAttempt.deleteOne({ _id: existing._id })
  }

  const { answers = [], timeTaken } = req.body

  // Grade only the questions the student actually answered (supports random K-of-N).
  // Unknown questionIds (not in this quiz) are ignored.
  let totalPoints = 0
  let earnedPoints = 0
  const gradedAnswers = []
  answers.forEach(a => {
    const q = quiz.questions.id(a.questionId)
    if (!q) return
    totalPoints += q.points
    const correct = gradeAnswer(q, a)
    if (correct) earnedPoints += q.points
    gradedAnswers.push({
      questionId: String(q._id),
      selected: a.selected || '',
      correct,
    })
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

  // Recompute avgScore via aggregation — avoids loading every QuizAttempt doc.
  const [agg] = await QuizAttempt.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: null, avg: { $avg: '$score' } } },
  ])
  const avgScore = agg ? Math.round(agg.avg) : score

  // Load the freshest user doc so we can update streak + badges in one save.
  const user = await User.findById(req.user._id)
  if (!existing) user.stats.quizzesTaken = (user.stats.quizzesTaken || 0) + 1
  user.stats.avgScore = avgScore
  user.xp = (user.xp || 0) + xpEarned
  user.level = Math.max(1, Math.floor(user.xp / 500) + 1)
  updateStreak(user)
  await user.save({ validateBeforeSave: false })

  // Side-effects: notification + badge rules (do not block on failure).
  await notify(user._id, {
    title:   passed ? 'Quiz passed!' : 'Quiz completed',
    message: `${quiz.title}: ${score}% (+${xpEarned} XP)`,
    type:    passed ? 'achievement' : 'quiz',
    icon:    passed ? '🎉' : '📝',
    link:    `/quizzes/${quiz._id}/result`,
  })
  const earned = await evaluateRules({ user, event: 'quiz_submitted', quiz, attempt })
  await awardBadges(user, earned)

  // Return full quiz with explanations for result page
  res.status(200).json({
    status: 'success',
    data: {
      attempt,
      score,
      passed,
      xpEarned,
      newBadges: earned,
      streak: user.streak,
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
// Optional scoping: ?scope=grade  → only students in the caller's (or query's)
// grade. ?scope=class&classId=...  → only students in that class. Default is
// global. Teachers/admins may pass any grade/classId; students are forced into
// their own.
exports.getLeaderboard = catchAsync(async (req, res) => {
  const filter = { role: 'student', isActive: true }

  const scope = req.query.scope
  if (scope === 'grade') {
    const grade = req.user.role === 'student'
      ? req.user.grade
      : (req.query.grade || req.user.grade)
    if (grade) filter.grade = String(grade)
  } else if (scope === 'class') {
    const requested = req.query.classId
    if (req.user.role === 'student') {
      const myClassIds = (req.user.classIds || []).map(String)
      if (requested && !myClassIds.includes(String(requested))) {
        return res.status(200).json({ status: 'success', results: 0, data: { leaderboard: [] } })
      }
      filter.classIds = { $in: req.user.classIds || [] }
    } else if (requested) {
      filter.classIds = requested
    }
  }

  const leaders = await User.find(filter)
    .select('name xp level avatarColor stats streak grade')
    .sort({ xp: -1 })
    .limit(50)
    .lean()

  const ranked = leaders.map((u, i) => ({ ...u, rank: i + 1 }))
  res.status(200).json({ status: 'success', results: ranked.length, data: { leaderboard: ranked } })
})

/* ── GET /api/v1/quizzes/my-attempts  (student) ──────────────────────────── */
exports.getMyAttempts = catchAsync(async (req, res) => {
  const page  = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const skip  = (page - 1) * limit

  const filter = { userId: req.user._id }
  const [attempts, total] = await Promise.all([
    QuizAttempt.find(filter)
      .populate({ path: 'quizId', select: 'title icon difficulty xpReward subjectId topicId', populate: { path: 'topicId', select: '_id name' } })
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    QuizAttempt.countDocuments(filter),
  ])
  res.status(200).json({
    status: 'success',
    results: attempts.length,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: { attempts },
  })
})

/* ── GET /api/v1/quizzes/:quizId/attempts  (teacher — all students) ──────── */
exports.getQuizAttempts = catchAsync(async (req, res) => {
  const page  = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const skip  = (page - 1) * limit

  const filter = { quizId: req.params.id }
  const [attempts, total] = await Promise.all([
    QuizAttempt.find(filter)
      .populate('userId', 'name email grade avatarColor')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    QuizAttempt.countDocuments(filter),
  ])
  res.status(200).json({
    status: 'success',
    results: attempts.length,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: { attempts },
  })
})

/* ── GET /api/v1/quizzes/attempts/:attemptId ─────────────────────────────── */
// Detailed attempt review: returns the attempt with the quiz's full questions
// populated, so callers can render a per-question breakdown of what the
// student selected vs the correct answer. Permissions:
//   student → must own the attempt
//   parent  → student must be in req.user.children
//   teacher → must share at least one class with the student
//   admin   → any
exports.getAttemptDetail = catchAsync(async (req, res, next) => {
  const attempt = await QuizAttempt.findById(req.params.attemptId)
    .populate({
      path:   'quizId',
      select: 'title icon difficulty xpReward passingScore durationMinutes questions subjectId topicId',
      populate: [
        { path: 'subjectId', select: 'name icon color' },
        { path: 'topicId',   select: 'name icon' },
      ],
    })
    .populate('userId', 'name grade avatarColor classIds')
    .lean()

  if (!attempt) return next(new AppError('Attempt not found.', 404))

  const studentId = String(attempt.userId._id || attempt.userId)
  const role = req.user.role

  if (role === 'student') {
    if (String(req.user._id) !== studentId) {
      return next(new AppError('You can only view your own attempts.', 403))
    }
  } else if (role === 'parent') {
    const childIds = (req.user.children || []).map(String)
    if (!childIds.includes(studentId)) {
      return next(new AppError('You can only view attempts for your own children.', 403))
    }
  } else if (role === 'teacher') {
    const teacherClassIds = (req.user.classIds || []).map(String)
    const studentClassIds = ((attempt.userId.classIds) || []).map(c => String(c._id || c))
    const shared = teacherClassIds.some(c => studentClassIds.includes(c))
    if (!shared) {
      return next(new AppError('You can only view attempts for students in your classes.', 403))
    }
  }
  // admin: no extra check

  res.status(200).json({ status: 'success', data: { attempt } })
})

/* ── DELETE /api/v1/quizzes/:id/attempts/:studentId  (teacher / admin) ──── */
// "Reissue" — wipe a student's existing attempt so they can take the quiz again.
// Teacher must share at least one class with the student (or own this quiz's
// assigned classes). Admin bypasses ownership checks.
exports.reissueQuiz = catchAsync(async (req, res, next) => {
  const { id: quizId, studentId } = req.params

  const quiz = await Quiz.findById(quizId)
  if (!quiz || !quiz.isActive) return next(new AppError('Quiz not found.', 404))

  const student = await User.findOne({ _id: studentId, role: 'student' }).select('classIds')
  if (!student) return next(new AppError('Student not found.', 404))

  if (req.user.role === 'teacher') {
    const teacherClasses = (req.user.classIds || []).map(String)
    const studentClasses = (student.classIds || []).map(String)
    const shared = teacherClasses.some(c => studentClasses.includes(c))
    if (!shared) {
      return next(new AppError('You can only reissue quizzes for students in your classes.', 403))
    }
  }

  const attempt = await QuizAttempt.findOne({ userId: studentId, quizId })
  if (!attempt) return next(new AppError('No attempt exists for this student on this quiz.', 404))

  await QuizAttempt.deleteOne({ _id: attempt._id })

  // Recompute avg via aggregation — avoids loading every attempt into memory.
  const [agg] = await QuizAttempt.aggregate([
    { $match: { userId: student._id } },
    { $group: { _id: null, avg: { $avg: '$score' } } },
  ])
  const avgScore = agg ? Math.round(agg.avg) : 0
  await User.findByIdAndUpdate(studentId, {
    $inc: { xp: -(attempt.xpEarned || 0), 'stats.quizzesTaken': -1 },
    $set: { 'stats.avgScore': avgScore },
  })

  res.status(200).json({
    status: 'success',
    message: 'Attempt cleared. Student may now retake this quiz.',
    data: { quizId, studentId },
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   Bookmarks — students can favourite quizzes for quick access.
   ───────────────────────────────────────────────────────────────────────────── */

/* POST /api/v1/quizzes/:id/bookmark */
exports.addBookmark = catchAsync(async (req, res, next) => {
  const exists = await Quiz.exists({ _id: req.params.id, isActive: true })
  if (!exists) return next(new AppError('Quiz not found.', 404))

  await User.findByIdAndUpdate(req.user._id, { $addToSet: { bookmarks: req.params.id } })
  res.status(200).json({ status: 'success', message: 'Quiz bookmarked.' })
})

/* DELETE /api/v1/quizzes/:id/bookmark */
exports.removeBookmark = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $pull: { bookmarks: req.params.id } })
  res.status(200).json({ status: 'success', message: 'Bookmark removed.' })
})

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/v1/quizzes/review/wrong-answers
   Lists questions the student got wrong across all their attempts, with the
   correct answer + explanation attached for review.
   ───────────────────────────────────────────────────────────────────────────── */
exports.getWrongAnswers = catchAsync(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)

  const attempts = await QuizAttempt.find({ userId: req.user._id })
    .populate('quizId', 'title icon questions subjectId topicId')
    .sort({ completedAt: -1 })
    .lean()

  const items = []
  for (const attempt of attempts) {
    const quiz = attempt.quizId
    if (!quiz) continue
    const qIndex = new Map(quiz.questions.map(q => [String(q._id), q]))
    for (const a of attempt.answers) {
      if (a.correct) continue
      const q = qIndex.get(String(a.questionId))
      if (!q) continue
      items.push({
        attemptId:     attempt._id,
        completedAt:   attempt.completedAt,
        quiz:          { _id: quiz._id, title: quiz.title, icon: quiz.icon },
        questionId:    q._id,
        questionText:  q.text,
        questionType:  q.type,
        yourAnswer:    a.selected,
        correctAnswer: q.correctAnswer,
        explanation:   q.explanation || '',
      })
      if (items.length >= limit) break
    }
    if (items.length >= limit) break
  }

  res.status(200).json({ status: 'success', results: items.length, data: { items } })
})
