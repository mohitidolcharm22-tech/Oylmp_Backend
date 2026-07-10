require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

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
const compression    = require('compression')
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
const classRoutes    = require('./routes/classRoutes')
const searchRoutes   = require('./routes/searchRoutes')
const adminRoutes    = require('./routes/adminRoutes')
const schoolRoutes   = require('./routes/schoolRoutes')
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
  .filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,  // needed for HttpOnly cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))

// Rate limiting on auth endpoints — prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests from this IP. Please try again after 15 minutes.' },
})

// General API rate limiter — prevents scraping / abuse of data endpoints.
// 1000/15min in production gives a logged-in user roughly ~1 request/sec which
// comfortably covers normal dashboard/quiz usage even with parallel fetches.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests. Please slow down.' },
})

/* ─── Body parsing ─────────────────────────────────────────────────────────── */
// Pre-flight OPTIONS must use the same CORS options (not the default wildcard)
app.options('*', cors(corsOptions))
app.use(compression())
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
// Short private cache for catalogue-style reads. 60s shaves the dashboard
// fan-out without making freshly created subjects/topics invisible for long.
const shortCache = (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'private, max-age=60')
  next()
}

app.use('/api/v1/auth',     authLimiter, authRoutes)
app.use('/api/v1/subjects', apiLimiter, shortCache, subjectRoutes)
app.use('/api/v1/topics',   apiLimiter, shortCache, topicRoutes)
app.use('/api/v1/lessons',  apiLimiter, lessonRoutes)
app.use('/api/v1/quizzes',  apiLimiter, quizRoutes)
app.use('/api/v1/users',    apiLimiter, userRoutes)
app.use('/api/v1/badges',   apiLimiter, shortCache, badgeRoutes)
app.use('/api/v1/classes',  apiLimiter, classRoutes)
app.use('/api/v1/search',   apiLimiter, searchRoutes)
app.use('/api/v1/admin',    apiLimiter, adminRoutes)
app.use('/api/v1/schools',  apiLimiter, schoolRoutes)

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
