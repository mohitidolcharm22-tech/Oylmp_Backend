const mongoose = require('mongoose')

let isConnected = false

const connectDB = async () => {
  if (isConnected) return

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These are sensible defaults for production-readiness
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })

    isConnected = true
    console.log(`✅  MongoDB connected: ${conn.connection.host}`)

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected')
      isConnected = false
    })

    mongoose.connection.on('error', (err) => {
      console.error('❌  MongoDB error:', err.message)
    })
  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message)
    process.exit(1)
  }
}

module.exports = connectDB
