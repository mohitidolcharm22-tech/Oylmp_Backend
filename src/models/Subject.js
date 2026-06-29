const mongoose = require('mongoose')

const subjectSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    icon:        { type: String, default: '📚' },
    color:       { type: String, default: '#6C63FF' },
    bgGradient:  { type: String },
    description: { type: String, trim: true },
    grades:      [{ type: String }],   // e.g. ['nursery','1','2','3','4','5']
    isActive:    { type: Boolean, default: true },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
)

// Virtual counts from child collections (populated on demand)
subjectSchema.virtual('totalTopics', {
  ref: 'Topic', localField: '_id', foreignField: 'subjectId', count: true,
})

module.exports = mongoose.model('Subject', subjectSchema)
