const Badge      = require('../models/Badge')
const catchAsync = require('../utils/catchAsync')
const AppError   = require('../utils/AppError')

/* GET /api/v1/badges  — any authenticated user */
exports.getAll = catchAsync(async (req, res) => {
  const filter = req.query.all === 'true' ? {} : { isActive: true }
  const badges = await Badge.find(filter)
    .populate('createdBy', 'name')
    .sort({ createdAt: 1 })
  res.status(200).json({ status: 'success', data: { badges } })
})

/* POST /api/v1/badges  — admin only */
exports.create = catchAsync(async (req, res, next) => {
  const { name, icon, description, color, category } = req.body
  if (!name) return next(new AppError('Badge name is required.', 400))
  const badge = await Badge.create({ name, icon, description, color, category, createdBy: req.user._id })
  res.status(201).json({ status: 'success', data: { badge } })
})

/* PATCH /api/v1/badges/:id  — admin only */
exports.update = catchAsync(async (req, res, next) => {
  const { name, icon, description, color, category, isActive } = req.body
  const badge = await Badge.findByIdAndUpdate(
    req.params.id,
    { name, icon, description, color, category, isActive },
    { new: true, runValidators: true }
  )
  if (!badge) return next(new AppError('Badge not found.', 404))
  res.status(200).json({ status: 'success', data: { badge } })
})

/* DELETE /api/v1/badges/:id  — admin only (soft-delete via isActive) */
exports.remove = catchAsync(async (req, res, next) => {
  const badge = await Badge.findByIdAndDelete(req.params.id)
  if (!badge) return next(new AppError('Badge not found.', 404))
  res.status(204).json({ status: 'success', data: null })
})
