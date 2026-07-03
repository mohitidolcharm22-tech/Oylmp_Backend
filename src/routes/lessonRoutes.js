const express = require('express')
const content = require('../controllers/contentController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

router.get('/:id',         protect, content.getLesson)
router.post('/:id/complete', protect, restrictTo('student', 'teacher', 'admin', 'school_admin', 'super_admin'), content.completeLesson)
router.post('/',           protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'), content.createLesson)
router.patch('/:id',       protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'), content.updateLesson)
router.delete('/:id',      protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'), content.deleteLesson)

module.exports = router
