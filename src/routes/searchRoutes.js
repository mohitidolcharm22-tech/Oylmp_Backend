const express = require('express')
const content = require('../controllers/contentController')
const { protect } = require('../middleware/auth')

const router = express.Router()

router.get('/', protect, content.search)

module.exports = router
