const express = require('express')
const content = require('../controllers/contentController')
const { protect, restrictTo, checkPermission } = require('../middleware/auth')

const router = express.Router()

// lesson:read    — all authenticated users can read lessons
router.get('/:id',           protect, checkPermission('lesson:read'),     content.getLesson)
// lesson:complete — students mark lessons done
router.post('/:id/complete', protect, checkPermission('lesson:complete'), content.completeLesson)
// lesson:create/edit/delete — teachers and above
router.post('/',             protect, checkPermission('lesson:create'),   content.createLesson)
router.patch('/:id',         protect, checkPermission('lesson:edit'),     content.updateLesson)
router.delete('/:id',        protect, checkPermission('lesson:delete'),   content.deleteLesson)

module.exports = router
