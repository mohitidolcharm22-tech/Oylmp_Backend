const jwt = require('jsonwebtoken')

/**
 * Sign a short-lived access token (15 min default)
 */
const signAccessToken = (userId) =>
  jwt.sign({ sub: userId, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  })

/**
 * Sign a long-lived refresh token (7 days default)
 */
const signRefreshToken = (userId) =>
  jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  })

/**
 * Attach the refresh token as an HttpOnly cookie
 */
const sendRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in ms
    path: '/api/v1/auth',
  })
}

module.exports = { signAccessToken, signRefreshToken, sendRefreshCookie }
