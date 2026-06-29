const express = require('express')
const content = require('../controllers/contentController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Topics ─────────────────────────────────────────────────────────────── */
router.get('/:id',          protect, content.getTopic)
router.post('/',            protect, restrictTo('admin', 'teacher'), content.createTopic)
router.patch('/:id',        protect, restrictTo('admin', 'teacher'), content.updateTopic)
router.get('/:id/lessons',  protect, content.getLessonsByTopic)

module.exports = router
