/**
 * Seed: Create / update the platform super_admin account.
 * Run once:  node scripts/seedSuperAdmin.js
 *
 * Credentials are read from environment variables so they never live in source code.
 * Set these before running (or pass inline):
 *
 *   SUPER_ADMIN_EMAIL=superadmin@olympquiz.com
 *   SUPER_ADMIN_PASSWORD=ChangeMe@2026!
 *   SUPER_ADMIN_NAME="Platform Super Admin"
 *
 * If the env vars are absent the defaults below are used and printed to the console.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const User     = require('../src/models/User')

const EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@olympquiz.com'
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'OlympQuiz@Super2026!'
const NAME     = process.env.SUPER_ADMIN_NAME     || 'Platform Super Admin'

;(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL)
    console.log('✅  Connected to MongoDB')

    const existing = await User.findOne({ email: EMAIL })

    if (existing) {
      // Update role in case the account existed as admin before
      existing.role     = 'super_admin'
      existing.schoolId = null
      existing.isActive = true
      await existing.save({ validateBeforeSave: false })
      console.log(`♻️   Updated existing user → super_admin  (${EMAIL})`)
    } else {
      await User.create({
        name:     NAME,
        email:    EMAIL,
        password: PASSWORD,
        role:     'super_admin',
        schoolId: null,
        isActive: true,
      })
      console.log(`🎉  Created super_admin account`)
    }

    console.log('')
    console.log('──────────────────────────────────────────')
    console.log('  Email    :', EMAIL)
    console.log('  Password :', PASSWORD)
    console.log('  Role     : super_admin')
    console.log('──────────────────────────────────────────')
    console.log('⚠️  Change this password after first login!')
    console.log('')
  } catch (err) {
    console.error('❌  Seed failed:', err.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
})()
