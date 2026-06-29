const express = require('express')
const uc = require('../controllers/userController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Notifications ─────────────────────────────────────────────────────── */
router.get('/notifications',                  protect, uc.getNotifications)
router.patch('/notifications/mark-all-read',  protect, uc.markAllRead)
router.patch('/notifications/:id/read',       protect, uc.markRead)

/* ─── Feedback ──────────────────────────────────────────────────────────── */
router.post('/feedback',       protect, uc.createFeedback)
router.get('/feedback',        protect, restrictTo('admin'), uc.getFeedback)
router.patch('/feedback/:id',  protect, restrictTo('admin'), uc.updateFeedback)

/* ─── Progress ───────────────────────────────────────────────────────────── */
router.get('/me/progress',         protect, uc.getStudentProgress)
router.get('/students',            protect, restrictTo('admin', 'teacher'), uc.getStudents)
router.get('/my-children',         protect, restrictTo('parent'), uc.getMyChildren)
router.post('/link-child',         protect, restrictTo('parent'), uc.linkChild)
router.get('/:id/progress',        protect, restrictTo('admin', 'teacher', 'parent'), uc.getStudentProgressById)
router.post('/:id/badges',         protect, restrictTo('admin', 'teacher'), uc.awardBadge)
router.delete('/:id/badges/:badgeId', protect, restrictTo('admin', 'teacher'), uc.revokeBadge)

module.exports = router
