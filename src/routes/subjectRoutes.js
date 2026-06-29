const express = require('express')
const content = require('../controllers/contentController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Subjects ──────────────────────────────────────────────────────────── */
router.get('/',              protect, content.getSubjects)
router.post('/',             protect, restrictTo('admin', 'teacher'), content.createSubject)
router.get('/:id',           protect, content.getSubject)
router.patch('/:id',         protect, restrictTo('admin', 'teacher'), content.updateSubject)
router.get('/:id/topics',    protect, content.getTopicsBySubject)

module.exports = router
