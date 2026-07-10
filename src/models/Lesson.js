const mongoose = require('mongoose')

const lessonSchema = new mongoose.Schema(
  {
    topicId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Topic',   required: true, index: true },
    subjectId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    title:      { type: String, required: true, trim: true },
    order:      { type: Number, default: 1 },
    type:       { type: String, enum: ['lesson', 'video', 'activity'], default: 'lesson' },
    duration:   { type: Number, default: 10 },   // minutes
    content:    { type: String, default: null },  // optional; required only if type !== 'video'
    youtubeUrl: { type: String, default: null, trim: true },  // YouTube URL for video lessons
    keyPoints:  [{ type: String }],
    xp:         { type: Number, default: 50 },
    isActive:   { type: Boolean, default: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },
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

// Custom validation: ensure content is provided unless it's a video lesson with a YouTube URL
lessonSchema.pre('save', function(next) {
  if (this.type === 'video') {
    // For video lessons: youtubeUrl is required
    if (!this.youtubeUrl) {
      return next(new Error('youtubeUrl is required for video lessons'))
    }
    // content is optional for video lessons
  } else {
    // For non-video lessons: content is required
    if (!this.content) {
      return next(new Error('content: Path `content` is required'))
    }
  }
  next()
})

// Also validate on update operations
lessonSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate()
  if (update.type === 'video') {
    if (!update.youtubeUrl) {
      return next(new Error('youtubeUrl is required for video lessons'))
    }
  } else if (update.type && update.type !== 'video') {
    if (!update.content) {
      return next(new Error('content: Path `content` is required'))
    }
  }
  next()
})

lessonSchema.index({ topicId: 1, order: 1 })
// getLessonsByTopic filters { topicId, isActive: true } and sorts by order.
lessonSchema.index({ topicId: 1, isActive: 1, order: 1 })

module.exports = mongoose.model('Lesson', lessonSchema)
