const express = require('express')
const quiz = require('../controllers/quizController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Public-ish (requires login) ─────────────────────────────────────────── */
router.get('/leaderboard',       protect, quiz.getLeaderboard)
router.get('/my-attempts',       protect, restrictTo('student'), quiz.getMyAttempts)
router.get('/',                  protect, quiz.getQuizzes)
router.post('/',                 protect, restrictTo('admin', 'teacher'), quiz.createQuiz)
router.get('/:id',               protect, quiz.getQuiz)
router.patch('/:id',             protect, restrictTo('admin', 'teacher'), quiz.updateQuiz)
router.delete('/:id',            protect, restrictTo('admin', 'teacher'), quiz.deleteQuiz)
router.post('/:id/submit',       protect, restrictTo('student'), quiz.submitQuiz)
router.get('/:id/result',        protect, restrictTo('student'), quiz.getQuizResult)
router.get('/:id/attempts',      protect, restrictTo('admin', 'teacher'), quiz.getQuizAttempts)

module.exports = router
