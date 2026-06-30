const express = require('express')
const quiz = require('../controllers/quizController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Public-ish (requires login) ─────────────────────────────────────────── */
router.get('/leaderboard',       protect, quiz.getLeaderboard)
router.get('/my-attempts',       protect, restrictTo('student'), quiz.getMyAttempts)
router.get('/review/wrong-answers', protect, restrictTo('student'), quiz.getWrongAnswers)
router.get('/attempts/:attemptId', protect, quiz.getAttemptDetail)
router.get('/',                  protect, quiz.getQuizzes)
router.post('/',                 protect, restrictTo('admin', 'teacher'), quiz.createQuiz)
router.get('/:id',               protect, quiz.getQuiz)
router.patch('/:id',             protect, restrictTo('admin', 'teacher'), quiz.updateQuiz)
router.delete('/:id',            protect, restrictTo('admin', 'teacher'), quiz.deleteQuiz)
router.post('/:id/submit',       protect, restrictTo('student'), quiz.submitQuiz)
router.get('/:id/result',        protect, restrictTo('student'), quiz.getQuizResult)
router.get('/:id/attempts',      protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'), quiz.getQuizAttempts)
router.delete('/:id/attempts/:studentId', protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'), quiz.reissueQuiz)
router.post('/:id/bookmark',     protect, restrictTo('student'), quiz.addBookmark)
router.delete('/:id/bookmark',   protect, restrictTo('student'), quiz.removeBookmark)

module.exports = router
