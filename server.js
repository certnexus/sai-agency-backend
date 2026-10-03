require('dotenv').config()

const express = require('express')
const cors = require('cors')
const connectDB = require('./config/db')
const { errorHandler } = require('./middleware/errorHandler')
const { createExcelIfNotExist } = require('./utils/excelManager')
const { seedAdmin } = require('./controllers/authController')
const { getOrCreateSettings } = require('./controllers/settingsController')

const authRoutes = require('./routes/authRoutes')
const namuna8Routes = require('./routes/namuna8Routes')
const namuna9Routes = require('./routes/namuna9Routes')
const settingsRoutes = require('./routes/settingsRoutes')

const app = express()
const PORT = process.env.PORT || 5000
const isDev = process.env.NODE_ENV !== 'production'

// Explicit whitelist — always honoured (used as-is in production).
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean)

// ✅ FIX: Vite auto-increments its port (5173 → 5174 → 5175 ...) whenever
// the previous one is busy, so a fixed whitelist keeps breaking CORS in
// local dev. In development we additionally allow ANY http://localhost:*
// or http://127.0.0.1:* origin. In production only `allowedOrigins` (driven
// by CLIENT_URL) is honoured, so this never loosens security for real users.
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      if (isDev && localhostRegex.test(origin)) {
        return callback(null, true)
      }
      callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gram Panchayat Tax API is running',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/namuna8', namuna8Routes)
app.use('/api/namuna9', namuna9Routes)
app.use('/api/settings', settingsRoutes)

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
})

app.use(errorHandler)

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      console.warn(
        'Warning: JWT_SECRET not set. Using default (not for production).',
      )
      process.env.JWT_SECRET = 'gram_panchayat_dev_secret_change_me'
    }

    await connectDB()

    createExcelIfNotExist()
    await seedAdmin()
    await getOrCreateSettings() // ✅ no-op now: rates are created per Gram Panchayat on first access

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`Health check: http://localhost:${PORT}/api/health`)
      console.log(
        `CORS allowed for: ${allowedOrigins.join(', ')}${isDev ? ' + any http://localhost:*  or 127.0.0.1:* (dev mode)' : ''}`,
      )
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  }
}

startServer()

module.exports = app