const jwt = require('jsonwebtoken')
const { getPermissionsForRole } = require('./permissions')

/**
 * Sign a short-lived access token (15 min default).
 *
 * CLAIMS EXPLAINED
 * ─────────────────────────────────────────────────────────────────────────────
 * sub         — Subject: the user's MongoDB _id (standard JWT claim).
 * type        — Custom claim to distinguish access vs refresh tokens.
 * role        — The user's role. Embedded so the server can authorize without
 *               a DB lookup (just decode + verify the token).
 * permissions — Array of fine-grained permission strings for this role.
 *               Any middleware can call req.user.permissions.includes('quiz:create')
 *               without touching the database.
 *
 * WHY NOT PUT PERMISSIONS IN THE REFRESH TOKEN?
 * The refresh token is only used to issue new access tokens — it never
 * authorizes API calls directly, so it stays minimal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const signAccessToken = (userId, role) =>
  jwt.sign(
    {
      sub:         userId,
      type:        'access',
      role,                                    // e.g. 'student', 'teacher'
      permissions: getPermissionsForRole(role), // e.g. ['quiz:read', 'quiz:attempt']
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
  )

/**
 * Sign a long-lived refresh token (7 days default).
 * Stays minimal — only sub + type, no role/permissions.
 */
const signRefreshToken = (userId) =>
  jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  })

/**
 * Attach the access token as an HttpOnly cookie.
 * Short-lived (15 min) — same expiry as the token itself.
 * HttpOnly = JS cannot read it → XSS-safe.
 */
const sendAccessCookie = (res, token) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m'
  // Parse expiry string like '15m', '1h', '2d' into milliseconds
  const ms = parseExpiry(expiresIn)
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'none' is required for cross-origin requests (Vercel frontend ↔ Railway backend).
    // 'strict' blocks the cookie entirely on cross-site requests.
    // 'none' requires secure:true, which is enforced above in production.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: ms,
  })
}

/**
 * Attach the refresh token as an HttpOnly cookie.
 * HttpOnly = JavaScript cannot read it → XSS-safe.
 * SameSite=strict = not sent on cross-site requests → CSRF-safe.
 */
const sendRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in ms
    path: '/api/v1/auth',
  })
}

/** Parse JWT expiry strings like '15m', '2h', '7d' into milliseconds */
const parseExpiry = (str) => {
  const num  = parseInt(str, 10)
  const unit = str.slice(-1)
  if (unit === 's') return num * 1000
  if (unit === 'm') return num * 60 * 1000
  if (unit === 'h') return num * 60 * 60 * 1000
  if (unit === 'd') return num * 24 * 60 * 60 * 1000
  return 15 * 60 * 1000 // default 15 min
}

module.exports = { signAccessToken, signRefreshToken, sendAccessCookie, sendRefreshCookie }

