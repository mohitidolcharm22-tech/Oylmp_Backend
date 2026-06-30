const mongoose = require('mongoose')

/*
 * Class — a roster of students taught by one or more teachers.
 * Used to scope quiz assignments and per-student progress visibility.
 *
 * studentIds / teacherIds are the source of truth; the User model carries
 * a denormalised `classIds` mirror so per-user filtering stays a single query.
 */
const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      maxlength: [60, 'Class name cannot exceed 60 characters'],
    },
    // Grade label (e.g. "5", "10") — string to match User.grade enum
    grade: {
      type: String,
      required: [true, 'Grade is required'],
    },
    section: {
      type: String,
      trim: true,
      maxlength: [10, 'Section cannot exceed 10 characters'],
      default: '',
    },
    description: {
      type: String,
      default: '',
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    teacherIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },
    studentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
)

classSchema.virtual('studentCount').get(function () {
  return this.studentIds?.length || 0
})
classSchema.virtual('teacherCount').get(function () {
  return this.teacherIds?.length || 0
})

classSchema.index({ grade: 1, name: 1 })

module.exports = mongoose.model('Class', classSchema)
