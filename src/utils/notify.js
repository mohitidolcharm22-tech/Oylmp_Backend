const Notification = require('../models/Notification')

// Fire-and-forget notification helper. Swallows errors so a notification
// failure never blocks the request flow that triggered it.
async function notify(userId, { title, message, type = 'system', icon, link }) {
  try {
    await Notification.create({ userId, title, message, type, icon, link })
  } catch (err) {
    console.error('notify() failed:', err.message)
  }
}

module.exports = { notify }
