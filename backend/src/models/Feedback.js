const mongoose = require('mongoose')

const feedbackSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    role:        { type: String, enum: ['student', 'teacher', 'parent', 'admin'] },
    category:    { type: String, default: 'general', trim: true },
    rating:      { type: Number, min: 1, max: 5 },
    title:       { type: String, trim: true },
    comment:     { type: String, trim: true },
    description: { type: String, trim: true },
    status:      { type: String, enum: ['open', 'in-review', 'resolved', 'closed'], default: 'open' },
    adminNotes:  { type: String },
  },
  { timestamps: true },
)

feedbackSchema.index({ status: 1, category: 1 })

module.exports = mongoose.model('Feedback', feedbackSchema)
