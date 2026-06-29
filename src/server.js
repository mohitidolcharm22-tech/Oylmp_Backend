require('dotenv').config()

/* ─────────────────────────────────────────────────────────────────────────────
   Validate required environment variables before anything else
   ───────────────────────────────────────────────────────────────────────────── */
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`\n❌  Missing required environment variables: ${missing.join(', ')}`)
  console.error('   Copy .env.example to .env and fill in the values.\n')
  process.exit(1)
}

const express        = require('express')
const helmet         = require('helmet')
const cors           = require('cors')
const morgan         = require('morgan')
const rateLimit      = require('express-rate-limit')
const cookieParser   = require('cookie-parser')
const mongoSanitize  = require('express-mongo-sanitize')

const connectDB      = require('./config/db')
const authRoutes     = require('./routes/authRoutes')
const subjectRoutes  = require('./routes/subjectRoutes')
const topicRoutes    = require('./routes/topicRoutes')
const lessonRoutes   = require('./routes/lessonRoutes')
const quizRoutes     = require('./routes/quizRoutes')
const userRoutes     = require('./routes/userRoutes')
const badgeRoutes    = require('./routes/badgeRoutes')
const errorHandler   = require('./middleware/errorHandler')
const AppError       = require('./utils/AppError')

/* ─────────────────────────────────────────────────────────────────────────────
   Connect to MongoDB
   ───────────────────────────────────────────────────────────────────────────── */
connectDB()

/* ─────────────────────────────────────────────────────────────────────────────
   Express app
   ───────────────────────────────────────────────────────────────────────────── */
const app = express()

/* ─── Security ─────────────────────────────────────────────────────────────── */
app.use(helmet())

// Sanitize request data — prevents NoSQL injection (e.g. { $gt: '' } attacks)
app.use(mongoSanitize())

// CORS — allow listed origins only (comma-separated in ALLOWED_ORIGINS env var)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    callback(null, false)   // reject silently — avoids crashing preflight
  },
  credentials: true,  // needed for HttpOnly cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Rate limiting on auth endpoints — prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests from this IP. Please try again after 15 minutes.' },
})

// General API rate limiter — prevents scraping / abuse of data endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests. Please slow down.' },
})

/* ─── Body parsing ─────────────────────────────────────────────────────────── */
// Pre-flight OPTIONS must be answered before rate limiting
app.options('*', cors())
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

/* ─── Logging ──────────────────────────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
}

/* ─── Health check ─────────────────────────────────────────────────────────── */
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'OlympQuiz API is running 🚀' })
})

/* ─── Routes ───────────────────────────────────────────────────────────────── */
app.use('/api/v1/auth',     authLimiter, authRoutes)
app.use('/api/v1/subjects', apiLimiter, subjectRoutes)
app.use('/api/v1/topics',   apiLimiter, topicRoutes)
app.use('/api/v1/lessons',  apiLimiter, lessonRoutes)
app.use('/api/v1/quizzes',  apiLimiter, quizRoutes)
app.use('/api/v1/users',    apiLimiter, userRoutes)
app.use('/api/v1/badges',   apiLimiter, badgeRoutes)

/* ─── 404 catch-all ────────────────────────────────────────────────────────── */
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found.`, 404))
})

/* ─── Global error handler ─────────────────────────────────────────────────── */
app.use(errorHandler)

/* ─────────────────────────────────────────────────────────────────────────────
   Start server
   ───────────────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000

const server = app.listen(PORT, () => {
  console.log(`\n✅  OlympQuiz API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
  console.log(`   Health: http://localhost:${PORT}/api/v1/health\n`)
})

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err.name, err.message)
  server.close(() => process.exit(1))
})

module.exports = app   // for testing
