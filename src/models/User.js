const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const ROLES    = ['student', 'teacher', 'parent', 'admin']
const GRADES   = ['Nursery', 'KG', '1', '2', '3', '4', '5']

/* ─────────────────────────────────────────────────────────────────────────────
   User Schema
   ───────────────────────────────────────────────────────────────────────────── */
const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2,  'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      unique: true,
      sparse: true,      // allows multiple docs with no email (students)
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    username: {
      type: String,
      unique: true,
      sparse: true,      // only students need a username
      lowercase: true,
      trim: true,
      minlength: [3,  'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-z0-9_]+$/, 'Username can only contain letters, numbers and underscores'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,   // never returned in queries unless explicitly requested
    },

    // ── Role & Profile ─────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: { values: ROLES, message: 'Role must be one of: student, teacher, parent, admin' },
      required: [true, 'Role is required'],
    },
    grade: {
      type: String,
      enum: { values: GRADES, message: 'Invalid grade' },
      required: function () { return this.role === 'student' },
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-]{7,15}$/, 'Please enter a valid phone number'],
    },
    avatar: {
      type: String,
      default: '',
    },
    avatarColor: {
      type: String,
      default: '#6C63FF',
    },

    // ── Relationships ──────────────────────────────────────────────────────────
    // Parent ↔ Student link
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Teacher's assigned class IDs (future use)
    classes: {
      type: [String],
      default: [],
    },
    // Parent's children user IDs
    children: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },

    // ── Gamification ──────────────────────────────────────────────────────────
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
    badges: {
      type: [String],
      default: [],
    },
    // Badges manually awarded by a teacher, with context
    teacherBadges: {
      type: [{
        badgeId:    { type: String, required: true },
        awardedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        awardedAt:  { type: Date, default: Date.now },
        note:       { type: String, default: '' },
      }],
      default: [],
    },
    // Lessons the student has completed
    completedLessons: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
      default: [],
    },

    // ── Stats ─────────────────────────────────────────────────────────────────
    stats: {
      quizzesTaken:      { type: Number, default: 0 },
      avgScore:          { type: Number, default: 0 },
      lessonsCompleted:  { type: Number, default: 0 },
    },

    // ── Account Status ─────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      code:      { type: String, select: false },
      expiresAt: { type: Date,   select: false },
    },

    // ── Security ──────────────────────────────────────────────────────────────
    passwordChangedAt: {
      type: Date,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,              // createdAt, updatedAt
    toJSON: {
      virtuals: true,
      transform(_, ret) {
        delete ret.password
        delete ret.otp
        delete ret.refreshToken
        delete ret.__v
        return ret
      },
    },
  }
)

/* ─── Indexes ───────────────────────────────────────────────────────────────── */
userSchema.index({ role: 1 })
userSchema.index({ parentId: 1 })
userSchema.index({ createdAt: -1 })

/* ─── Virtuals ──────────────────────────────────────────────────────────────── */
userSchema.virtual('fullName').get(function () {
  return this.name
})

userSchema.virtual('xpToNextLevel').get(function () {
  return this.level * 500 - this.xp
})

/* ─── Pre-save: hash password ───────────────────────────────────────────────── */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  const salt = await bcrypt.genSalt(12)
  this.password = await bcrypt.hash(this.password, salt)

  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000)  // ensure JWT issued before this
  }
  next()
})

/* ─── Instance Methods ──────────────────────────────────────────────────────── */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.changedPasswordAfter = function (jwtIssuedAt) {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000)
    return jwtIssuedAt < changedTimestamp
  }
  return false
}

const User = mongoose.model('User', userSchema)
module.exports = User
