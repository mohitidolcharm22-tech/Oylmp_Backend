const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:    { type: String, required: true },
    message:  { type: String, required: true },
    type:     { type: String, enum: ['quiz', 'lesson', 'achievement', 'system', 'parent', 'teacher'], default: 'system' },
    icon:     { type: String, default: '🔔' },
    isRead:   { type: Boolean, default: false, index: true },
    link:     { type: String },   // optional deep-link path
  },
  { timestamps: true },
)

notificationSchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', notificationSchema)
