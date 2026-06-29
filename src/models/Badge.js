const mongoose = require('mongoose')

const badgeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  icon:        { type: String, required: true, default: '🏅' },
  description: { type: String, default: '' },
  color:       { type: String, default: '#6C63FF' },
  category:    { type: String, default: 'general' },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = mongoose.model('Badge', badgeSchema)
