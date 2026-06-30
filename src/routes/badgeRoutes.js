const express = require('express')
const bc = require('../controllers/badgeController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

router.get('/',      protect, bc.getAll)
router.post('/',     protect, restrictTo('admin', 'school_admin', 'super_admin'), bc.create)
router.patch('/:id', protect, restrictTo('admin', 'school_admin', 'super_admin'), bc.update)
router.delete('/:id',protect, restrictTo('admin', 'school_admin', 'super_admin'), bc.remove)

module.exports = router
