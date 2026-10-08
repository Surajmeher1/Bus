require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const { activityLogger } = require('./middleware/auth');

// ── Initialize DB ─────────────────────────────────────────────────────────────
const db = require('./config/db');

// ── Express App ───────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Compression & Production Security Headers ──────────────────────────────────
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://unpkg.com", "https://images.unsplash.com"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
        workerSrc: ["'self'", "blob:"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach io to every request for controllers to emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Activity logger
app.use(activityLogger(db));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// Serve frontend static files
const FRONTEND_PATH = path.join(__dirname, '../frontend');
app.use(express.static(FRONTEND_PATH));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',     require('./routes/auth'));
app.use('/api/v1/students', require('./routes/student'));
app.use('/api/v1/buses',    require('./routes/bus'));
app.use('/api/v1/routes',   require('./routes/route'));
app.use('/api/v1/trips',    require('./routes/trip'));
app.use('/api/v1/driver',   require('./routes/driver'));   // ← Review 1: Driver GPS portal
app.use('/api/v1',          require('./routes/admin'));
app.use('/api/v1',          require('./routes/misc'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Smart Bus Tracking API is running 🚌', timestamp: new Date() });
});

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
});

// ── Socket Tracking ───────────────────────────────────────────────────────────
const setupTrackingSocket = require('./socket/trackingSocket');
setupTrackingSocket(io);

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚌 Smart University Bus Tracking System`);
  console.log(`   Server running at: http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend: http://localhost:${PORT}/index.html\n`);
});

module.exports = { app, server };
