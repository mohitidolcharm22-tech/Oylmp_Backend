/**
 * Creates (or resets) the default admin account.
 * Run:  node src/scripts/createAdmin.js
 *
 * Default credentials:
 *   Email    : admin@olympquiz.com
 *   Password : Admin@123
 */
require('dotenv').config()
const connectDB = require('../config/db')
const User      = require('../models/User')

const ADMIN_EMAIL    = 'admin@olympquiz.com'
const ADMIN_PASSWORD = 'Admin@123'

async function run() {
  await connectDB()

  const existing = await User.findOne({ email: ADMIN_EMAIL })

  if (existing) {
    // Reset password in case it was changed
    existing.password = ADMIN_PASSWORD
    existing.isActive = true
    await existing.save()
    console.log(`✅ Admin password reset  →  ${ADMIN_EMAIL}  |  Admin@123`)
  } else {
    await User.create({
      name:     'Admin',
      email:    ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role:     'admin',
    })
    console.log(`✅ Admin created  →  ${ADMIN_EMAIL}  |  Admin@123`)
  }

  process.exit(0)
}

run().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
