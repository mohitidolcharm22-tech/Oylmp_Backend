const express = require('express')
const cc = require('../controllers/classController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

router.use(protect, restrictTo('admin', 'school_admin', 'super_admin', 'teacher'))

router.get('/',     cc.listClasses)
router.post('/',    cc.createClass)
router.get('/:id',  cc.getClass)
router.patch('/:id', cc.updateClass)
router.delete('/:id', cc.deleteClass)

router.post('/:id/students', cc.addStudents)
router.delete('/:id/students/:studentId', cc.removeStudent)

router.post('/:id/teachers', cc.addTeachers)
router.delete('/:id/teachers/:teacherId', cc.removeTeacher)

module.exports = router
