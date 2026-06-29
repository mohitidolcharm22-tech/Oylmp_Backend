const mongoose = require('mongoose')

const topicSchema = new mongoose.Schema(
  {
    subjectId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    name:        { type: String, required: true, trim: true },
    icon:        { type: String, default: '📖' },
    grade:       [{ type: String }],   // grades this topic belongs to
    order:       { type: Number, default: 0 },
    difficulty:  { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
)

topicSchema.virtual('lessonCount', {
  ref: 'Lesson', localField: '_id', foreignField: 'topicId', count: true,
})
topicSchema.virtual('quizCount', {
  ref: 'Quiz', localField: '_id', foreignField: 'topicId', count: true,
})

topicSchema.index({ subjectId: 1, order: 1 })

module.exports = mongoose.model('Topic', topicSchema)
