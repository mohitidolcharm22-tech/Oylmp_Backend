/**
 * youtubeValidation.js — Server-side YouTube URL educational content validator.
 *
 * Accepted educational categories:
 *   27 - Education
 *   28 - Science & Technology
 *   25 - News & Politics
 *
 * Required env variable: YOUTUBE_API_KEY
 */

const https = require('https')

const EDUCATIONAL_CATEGORY_IDS = new Set(['27', '28', '25'])

/**
 * Extracts the YouTube video ID from common URL formats.
 * @param {string} url
 * @returns {string|null}
 */
function extractYoutubeVideoId(url = '') {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[?&]v=([A-Za-z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.trim().match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

/**
 * Fetches JSON from a URL using Node's built-in https module.
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

/**
 * Validates a YouTube URL for educational content using YouTube Data API v3.
 *
 * @param {string} url - The YouTube URL to validate
 * @returns {Promise<{valid: boolean, reason?: string, message?: string, videoId?: string, title?: string}>}
 */
async function validateYoutubeUrl(url) {
  const apiKey = process.env.YOUTUBE_API_KEY

  // 1. Extract video ID
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    return { valid: false, reason: 'invalid_url', message: 'Invalid YouTube URL format.' }
  }

  // 2. If API key not configured, skip validation (warn in logs)
  if (!apiKey) {
    console.warn('[youtubeValidation] YOUTUBE_API_KEY not set — skipping educational check.')
    return { valid: true, videoId }
  }

  // 3. Fetch from YouTube Data API
  try {
    const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${apiKey}`
    const data = await fetchJson(endpoint)

    // 4. Check video exists
    if (!data.items || data.items.length === 0) {
      return { valid: false, reason: 'not_found', message: 'Video not found. It may be private, deleted, or the URL is incorrect.' }
    }

    const video   = data.items[0]
    const snippet = video.snippet
    const status  = video.status

    // 5. Check if public
    if (status?.privacyStatus !== 'public') {
      return {
        valid: false,
        reason: 'restricted',
        message: `Video is ${status?.privacyStatus ?? 'not public'}. Only public videos are allowed.`,
      }
    }

    // 6. Check age restriction
    if (status?.contentRating?.ytRating === 'ytAgeRestricted') {
      return { valid: false, reason: 'restricted', message: 'Video is age-restricted and cannot be used as lesson material.' }
    }

    // 7. Check educational category
    const categoryId = snippet?.categoryId
    if (!EDUCATIONAL_CATEGORY_IDS.has(categoryId)) {
      return {
        valid: false,
        reason: 'not_educational',
        message: `Video category is not educational (categoryId: ${categoryId}). Only Education and Science & Technology videos are allowed.`,
        categoryId,
        title: snippet?.title,
      }
    }

    return { valid: true, videoId, title: snippet?.title, categoryId }
  } catch (err) {
    console.error('[youtubeValidation] API error:', err.message)
    // On API error, fail open (allow) but log it — don't block teachers due to API outages
    return { valid: true, videoId, warning: 'YouTube API unavailable; category check skipped.' }
  }
}

module.exports = { validateYoutubeUrl, extractYoutubeVideoId }
