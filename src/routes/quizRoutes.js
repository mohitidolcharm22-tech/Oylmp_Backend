const express = require('express')
const quiz = require('../controllers/quizController')
const { protect, restrictTo, checkPermission } = require('../middleware/auth')

const router = express.Router()

/* ─── Public-ish (requires login) ─────────────────────────────────────────── */
router.get('/leaderboard',          protect, quiz.getLeaderboard)
router.get('/my-attempts',          protect, checkPermission('quiz:attempt'),  quiz.getMyAttempts)
router.get('/review/wrong-answers', protect, checkPermission('quiz:attempt'),  quiz.getWrongAnswers)
router.get('/attempts/:attemptId',  protect, quiz.getAttemptDetail)
router.get('/',                     protect, checkPermission('quiz:read'),     quiz.getQuizzes)
router.post('/',                    protect, checkPermission('quiz:create'),   quiz.createQuiz)
router.get('/:id',                  protect, checkPermission('quiz:read'),     quiz.getQuiz)
router.patch('/:id',                protect, checkPermission('quiz:edit'),     quiz.updateQuiz)
router.delete('/:id',               protect, checkPermission('quiz:delete'),   quiz.deleteQuiz)
router.post('/:id/submit',          protect, checkPermission('quiz:attempt'),  quiz.submitQuiz)
router.get('/:id/result',           protect, checkPermission('quiz:attempt'),  quiz.getQuizResult)
router.get('/:id/attempts',         protect, checkPermission('report:view'),   quiz.getQuizAttempts)
router.delete('/:id/attempts/:studentId', protect, checkPermission('user:manage'), quiz.reissueQuiz)
router.post('/:id/bookmark',     protect, restrictTo('student'), quiz.addBookmark)
router.delete('/:id/bookmark',   protect, restrictTo('student'), quiz.removeBookmark)

module.exports = router
