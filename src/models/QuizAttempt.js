const mongoose = require('mongoose')

// Stores one quiz attempt per student per quiz
const quizAttemptSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quizId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    answers:   [{ questionId: String, selected: String, correct: Boolean }],
    score:     { type: Number, required: true },          // percentage
    xpEarned:  { type: Number, default: 0 },
    passed:    { type: Boolean, default: false },
    timeTaken: { type: Number },                           // seconds
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

quizAttemptSchema.index({ userId: 1, quizId: 1 })
// Supports my-attempts list sorted by completedAt desc, and the
// passed-count aggregation used by badge rules.
quizAttemptSchema.index({ userId: 1, completedAt: -1 })
quizAttemptSchema.index({ userId: 1, passed: 1 })

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema)
