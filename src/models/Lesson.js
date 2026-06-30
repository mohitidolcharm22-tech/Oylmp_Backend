const mongoose = require('mongoose')

const lessonSchema = new mongoose.Schema(
  {
    topicId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Topic',   required: true, index: true },
    subjectId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    title:      { type: String, required: true, trim: true },
    order:      { type: Number, default: 1 },
    type:       { type: String, enum: ['lesson', 'video', 'activity'], default: 'lesson' },
    duration:   { type: Number, default: 10 },   // minutes
    content:    { type: String, required: true },
    keyPoints:  [{ type: String }],
    xp:         { type: Number, default: 50 },
    isActive:   { type: Boolean, default: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
    moderatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt:   { type: Date },
    moderationNote:{ type: String, trim: true },
  },
  { timestamps: true },
)

lessonSchema.index({ topicId: 1, order: 1 })
// getLessonsByTopic filters { topicId, isActive: true } and sorts by order.
lessonSchema.index({ topicId: 1, isActive: 1, order: 1 })

module.exports = mongoose.model('Lesson', lessonSchema)
