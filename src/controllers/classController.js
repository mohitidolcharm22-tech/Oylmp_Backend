const mongoose   = require('mongoose')
const Class      = require('../models/Class')
const User       = require('../models/User')
const AppError   = require('../utils/AppError')
const catchAsync = require('../utils/catchAsync')

/* ── Helpers ──────────────────────────────────────────────────────────────── */

// Throws if `req.user` is a teacher and `cls.teacherIds` doesn't contain them.
// Admins always pass. Handles both raw ObjectId entries and populated subdocs.
function assertTeacherOwnsClass(cls, user) {
  if (user.role === 'admin') return
  const teacherIds = (cls.teacherIds || []).map(t => String(t?._id || t))
  if (!teacherIds.includes(String(user._id))) {
    throw new AppError('You do not have access to this class.', 403)
  }
}

/* ── GET /api/v1/classes ──────────────────────────────────────────────────── */
// Admin: all classes. Teacher: only classes they teach.
// Optional query: ?grade=5
exports.listClasses = catchAsync(async (req, res) => {
  const filter = { isActive: true }
  if (req.user.role === 'teacher') filter.teacherIds = req.user._id
  if (req.query.grade) filter.grade = String(req.query.grade)

  const classes = await Class.find(filter)
    .populate('teacherIds', 'name email avatarColor')
    .sort({ grade: 1, name: 1 })
    .lean()

  res.status(200).json({ status: 'success', results: classes.length, data: { classes } })
})

/* ── GET /api/v1/classes/:id ──────────────────────────────────────────────── */
exports.getClass = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
    .populate('teacherIds', 'name email avatarColor')
    .populate('studentIds', 'name email username grade avatarColor xp level stats')
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)
  res.status(200).json({ status: 'success', data: { class: cls } })
})

/* ── POST /api/v1/classes  (teacher / admin) ──────────────────────────────── */
exports.createClass = catchAsync(async (req, res, next) => {
  const { name, grade, section, description, teacherIds = [], studentIds = [] } = req.body
  if (!name || !grade) return next(new AppError('name and grade are required.', 400))

  // Teachers creating a class automatically join it.
  const teachers = new Set([...teacherIds.map(String)])
  if (req.user.role === 'teacher') teachers.add(String(req.user._id))

  const cls = await Class.create({
    name: name.trim(),
    grade: String(grade),
    section: section?.trim() || '',
    description: description || '',
    teacherIds: [...teachers],
    studentIds,
    createdBy: req.user._id,
  })

  // Mirror membership onto User.classIds
  if (cls.teacherIds.length) {
    await User.updateMany(
      { _id: { $in: cls.teacherIds } },
      { $addToSet: { classIds: cls._id } },
    )
  }
  if (cls.studentIds.length) {
    await User.updateMany(
      { _id: { $in: cls.studentIds }, role: 'student' },
      { $addToSet: { classIds: cls._id } },
    )
  }

  res.status(201).json({ status: 'success', data: { class: cls } })
})

/* ── PATCH /api/v1/classes/:id  (teacher who owns it / admin) ─────────────── */
exports.updateClass = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)

  const allowed = ['name', 'grade', 'section', 'description']
  allowed.forEach(k => {
    if (req.body[k] !== undefined) cls[k] = req.body[k]
  })
  await cls.save()
  res.status(200).json({ status: 'success', data: { class: cls } })
})

/* ── DELETE /api/v1/classes/:id  (teacher who owns it / admin) ────────────── */
// Soft-delete + detach mirror references on User.classIds.
exports.deleteClass = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)

  cls.isActive = false
  await cls.save()
  await User.updateMany(
    { classIds: cls._id },
    { $pull: { classIds: cls._id } },
  )
  res.status(204).json({ status: 'success', data: null })
})

/* ── POST /api/v1/classes/:id/students  body: { studentIds: [..] } ──────── */
exports.addStudents = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)

  const ids = (req.body.studentIds || []).filter(id => mongoose.isValidObjectId(id))
  if (!ids.length) return next(new AppError('studentIds is required.', 400))

  // Verify all are real students
  const found = await User.find({ _id: { $in: ids }, role: 'student' }).select('_id')
  const validIds = found.map(u => u._id)

  await Class.updateOne({ _id: cls._id }, { $addToSet: { studentIds: { $each: validIds } } })
  await User.updateMany(
    { _id: { $in: validIds } },
    { $addToSet: { classIds: cls._id } },
  )

  const updated = await Class.findById(cls._id).populate('studentIds', 'name email username grade avatarColor')
  res.status(200).json({ status: 'success', data: { class: updated } })
})

/* ── DELETE /api/v1/classes/:id/students/:studentId ──────────────────────── */
exports.removeStudent = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)

  await Class.updateOne({ _id: cls._id }, { $pull: { studentIds: req.params.studentId } })
  await User.updateOne({ _id: req.params.studentId }, { $pull: { classIds: cls._id } })

  res.status(204).json({ status: 'success', data: null })
})

/* ── POST /api/v1/classes/:id/teachers  body: { teacherIds: [..] } ──────── */
exports.addTeachers = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  assertTeacherOwnsClass(cls, req.user)

  const ids = (req.body.teacherIds || []).filter(id => mongoose.isValidObjectId(id))
  if (!ids.length) return next(new AppError('teacherIds is required.', 400))

  const found = await User.find({ _id: { $in: ids }, role: 'teacher' }).select('_id')
  const validIds = found.map(u => u._id)

  await Class.updateOne({ _id: cls._id }, { $addToSet: { teacherIds: { $each: validIds } } })
  await User.updateMany(
    { _id: { $in: validIds } },
    { $addToSet: { classIds: cls._id } },
  )

  const updated = await Class.findById(cls._id).populate('teacherIds', 'name email avatarColor')
  res.status(200).json({ status: 'success', data: { class: updated } })
})

/* ── DELETE /api/v1/classes/:id/teachers/:teacherId ──────────────────────── */
exports.removeTeacher = catchAsync(async (req, res, next) => {
  const cls = await Class.findById(req.params.id)
  if (!cls || !cls.isActive) return next(new AppError('Class not found.', 404))
  // Only admin or the teacher removing themselves
  if (req.user.role !== 'admin' && String(req.user._id) !== String(req.params.teacherId)) {
    return next(new AppError('Only admins can remove other teachers from a class.', 403))
  }

  await Class.updateOne({ _id: cls._id }, { $pull: { teacherIds: req.params.teacherId } })
  await User.updateOne({ _id: req.params.teacherId }, { $pull: { classIds: cls._id } })

  res.status(204).json({ status: 'success', data: null })
})
