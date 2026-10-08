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
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
          "https://*.tile.openstreetmap.fr",
          "https://*.openstreetmap.fr",
          "https://server.arcgisonline.com",
          "https://*.basemaps.cartocdn.com",
          "https://*.cartocdn.com",
          "https://unpkg.com",
          "https://images.unsplash.com"
        ],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
        workerSrc: ["'self'", "blob:"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// ── CORS Configuration ────────────────────────────────────────────────────────
const getAllowedOrigins = () => {
  const allowed = [];
  if (process.env.CLIENT_URL) {
    allowed.push(...process.env.CLIENT_URL.split(',').map(s => s.trim().replace(/\/+$/, '')));
  }
  if (process.env.APP_URL) {
    allowed.push(...process.env.APP_URL.split(',').map(s => s.trim().replace(/\/+$/, '')));
  }
  return allowed.filter(Boolean);
};

const isOriginAllowed = (origin) => {
  // Allow requests without Origin header (e.g. same-origin static requests, mobile webviews, curl)
  if (!origin) return true;

  const isProduction = process.env.NODE_ENV === 'production';
  // Allow localhost / local IP on any port in development
  if (!isProduction) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  // Allow Capacitor Android native scheme
  if (origin === 'capacitor://localhost' || origin === 'http://localhost') {
    return true;
  }

  const allowed = getAllowedOrigins();
  if (allowed.length > 0) {
    return allowed.includes(origin);
  }

  // Fallback: in development allow all, in production require exact match
  return !isProduction;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-simulate-smtp-configured', 'x-test-smtp']
};

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Attach io to every request for controllers to emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
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

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Smart Bus Tracking API is running 🚌', timestamp: new Date() });
});

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Internal server error.' : (err.message || 'Internal server error.'),
    ...(isProd ? {} : { error: err.message })
  });
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
