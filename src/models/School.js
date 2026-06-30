const mongoose = require('mongoose')

/*
 * School — top-level tenant.
 * Every user, class, subject, quiz, lesson etc. is scoped under a School.
 * A "super_admin" (platform-level) can manage all schools.
 * A "school_admin" can only manage their own school's data.
 */
const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
      maxlength: [120, 'School name cannot exceed 120 characters'],
    },
    code: {
      // Short unique slug, e.g. "DPS-ROHINI" — used in invite links
      type: String,
      required: [true, 'School code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{2,20}$/, 'Code must be 2-20 uppercase letters, digits, hyphens or underscores'],
    },
    address:  { type: String, trim: true, default: '' },
    city:     { type: String, trim: true, default: '' },
    state:    { type: String, trim: true, default: '' },
    country:  { type: String, trim: true, default: 'India' },
    phone:    { type: String, trim: true, default: '' },
    email:    { type: String, lowercase: true, trim: true, default: '' },
    logoUrl:  { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    isActive: { type: Boolean, default: true, index: true },
    // Free-form metadata (board, affiliation number, etc.)
    meta:     { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

module.exports = mongoose.model('School', schoolSchema)
