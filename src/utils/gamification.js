const Lesson = require('../models/Lesson')
const QuizAttempt = require('../models/QuizAttempt')
const { notify } = require('./notify')

/* ─────────────────────────────────────────────────────────────────────────────
   Streak — update lastActiveDate and streak counter on any "active" event.
   Returns { streak, leveledUp } so callers can react (e.g. award streak badges).
   ───────────────────────────────────────────────────────────────────────────── */
function updateStreak(user) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const last = user.lastActiveDate ? new Date(user.lastActiveDate) : null
  if (last) last.setHours(0, 0, 0, 0)

  const dayMs = 24 * 60 * 60 * 1000
  let newStreak = user.streak || 0

  if (!last) {
    newStreak = 1
  } else {
    const diff = Math.round((today - last) / dayMs)
    if (diff === 0)      newStreak = newStreak || 1   // same day — no change
    else if (diff === 1) newStreak = newStreak + 1    // consecutive day
    else                 newStreak = 1                // streak broken
  }

  user.streak = newStreak
  user.lastActiveDate = new Date()
  return newStreak
}

/* ─────────────────────────────────────────────────────────────────────────────
   Badge rules — pure functions that return badge names to award given a
   context. Each rule returns an array of badge names (strings) or [].
   Badges are stored as name strings on user.badges; a matching Badge doc in
   the catalogue is optional (frontend resolves icon by name).
   ───────────────────────────────────────────────────────────────────────────── */

// Context shape: { user, event, quiz?, attempt?, lesson?, allAttempts?, topicLessonsDone? }
async function evaluateRules(ctx) {
  const earned = []
  const has = (name) => (ctx.user.badges || []).includes(name)

  // First Quiz
  if (ctx.event === 'quiz_submitted' && !has('First Quiz')) {
    earned.push('First Quiz')
  }

  // Perfect Score
  if (ctx.event === 'quiz_submitted' && ctx.attempt?.score === 100 && !has('Perfect Score')) {
    earned.push('Perfect Score')
  }

  // Quiz Streak 5 — 5 passed quizzes
  if (ctx.event === 'quiz_submitted' && ctx.attempt?.passed) {
    const passedCount = await QuizAttempt.countDocuments({ userId: ctx.user._id, passed: true })
    if (passedCount >= 5 && !has('Quiz Streak 5')) earned.push('Quiz Streak 5')
    if (passedCount >= 25 && !has('Quiz Master')) earned.push('Quiz Master')
  }

  // Daily streak milestones
  if (ctx.user.streak === 7  && !has('Streak 7'))  earned.push('Streak 7')
  if (ctx.user.streak === 30 && !has('Streak 30')) earned.push('Streak 30')

  // First Lesson
  if (ctx.event === 'lesson_completed' && !has('Lesson Star')) {
    earned.push('Lesson Star')
  }

  // Topic Master — all lessons in the lesson's topic completed
  if (ctx.event === 'lesson_completed' && ctx.lesson?.topicId) {
    const lessonsInTopic = await Lesson.find(
      { topicId: ctx.lesson.topicId, isActive: true },
      { _id: 1 },
    ).lean()
    const completedSet = new Set((ctx.user.completedLessons || []).map(String))
    const allDone = lessonsInTopic.length > 0 &&
      lessonsInTopic.every(l => completedSet.has(String(l._id)))
    if (allDone && !has('Topic Master')) earned.push('Topic Master')
  }

  return earned
}

/* ─────────────────────────────────────────────────────────────────────────────
   Award helper — mutates user.badges, persists changes, and fires a
   notification per new badge. Caller is responsible for awaiting before
   responding (so the user sees the badge on the next /auth/me call).
   ───────────────────────────────────────────────────────────────────────────── */
async function awardBadges(user, badgeNames) {
  if (!badgeNames.length) return []
  const fresh = badgeNames.filter(n => !(user.badges || []).includes(n))
  if (!fresh.length) return []

  user.badges = [...(user.badges || []), ...fresh]
  await user.save({ validateBeforeSave: false })

  await Promise.all(fresh.map(name =>
    notify(user._id, {
      title:   'New badge unlocked!',
      message: `You earned the "${name}" badge.`,
      type:    'achievement',
      icon:    '🏅',
    })
  ))

  return fresh
}

module.exports = { updateStreak, evaluateRules, awardBadges }
