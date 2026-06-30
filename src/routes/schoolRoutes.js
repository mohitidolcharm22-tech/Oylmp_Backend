const express = require('express')
const school  = require('../controllers/schoolController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

router.use(protect)

// Any authenticated user can look up a school by id (for display purposes)
router.get('/:id', restrictTo('super_admin', 'school_admin', 'admin'), school.getSchool)

// Super-admin only
router.use(restrictTo('super_admin'))
router.get('/',                          school.listSchools)
router.post('/',                         school.createSchool)
router.patch('/:id',                     school.updateSchool)
router.patch('/:id/toggle-status',       school.toggleSchoolStatus)
router.get('/:id/admins',                school.listSchoolAdmins)
router.post('/:id/admins',               school.addSchoolAdmin)
router.post('/:id/admins/new',           school.createSchoolAdmin)

module.exports = router
