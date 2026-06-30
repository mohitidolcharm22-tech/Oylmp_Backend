const express = require('express')
const admin   = require('../controllers/adminController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

router.use(protect, restrictTo('admin', 'school_admin', 'super_admin'))

router.get('/stats',                       admin.getStats)
router.get('/moderation',                  admin.listModeration)
router.get('/moderation/:kind/:id',        admin.getModerationItem)
router.patch('/moderation/:kind/:id',      admin.moderateItem)

module.exports = router
