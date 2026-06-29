const express  = require('express')
const { body } = require('express-validator')
const authController = require('../controllers/authController')
const { protect, restrictTo } = require('../middleware/auth')

const router = express.Router()

/* ─── Validation rules ─────────────────────────────────────────────────────── */
const registerRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),

  // Students use username; everyone else uses email
  body('email')
    .if(body('role').not().equals('student'))
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('username')
    .if(body('role').equals('student'))
    .trim().notEmpty().withMessage('Username is required for students')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
    .matches(/^[a-z0-9_]+$/).withMessage('Username can only contain letters, numbers and underscores'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['student', 'teacher', 'parent', 'admin']).withMessage('Role must be: student, teacher, parent, or admin'),

  body('grade')
    .if(body('role').equals('student'))
    .notEmpty().withMessage('Grade is required for students')
    .isIn(['Nursery', 'KG', '1', '2', '3', '4', '5']).withMessage('Invalid grade'),

  body('phone')
    .optional()
    .isMobilePhone().withMessage('Please provide a valid phone number'),
]

const loginRules = [
  body('email').trim().notEmpty().withMessage('Email or username is required'),
  body('password').notEmpty().withMessage('Password is required'),
]

/* ─── Routes ───────────────────────────────────────────────────────────────── */

/**
 * @route  POST /api/v1/auth/register
 * @desc   Register a new user (student / teacher / parent / admin)
 * @access Public
 */
router.post('/register', registerRules, authController.register)

/**
 * @route  POST /api/v1/auth/login
 * @desc   Login with email + password
 * @access Public
 */
router.post('/login', loginRules, authController.login)

/**
 * @route  POST /api/v1/auth/logout
 * @desc   Clear refresh token cookie
 * @access Public
 */
router.post('/logout', authController.logout)

/**
 * @route  GET /api/v1/auth/me
 * @desc   Get currently authenticated user
 * @access Private
 */
router.get('/me', protect, authController.getMe)

/**
 * @route  GET /api/v1/auth/users
 * @desc   List all users (admin only)
 * @access Private/Admin
 */
router.get('/users', protect, restrictTo('admin'), authController.listUsers)

/**
 * @route  PATCH /api/v1/auth/users/:id/toggle-status
 * @desc   Enable / disable a user account (admin only)
 * @access Private/Admin
 */
router.patch('/users/:id/toggle-status',   protect, restrictTo('admin'), authController.toggleUserStatus)
router.patch('/users/:id/reset-password',  protect, restrictTo('admin'), authController.resetUserPassword)

module.exports = router
