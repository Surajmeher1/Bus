/**
 * trackingSocket.js — Review 1
 *
 * Dual-mode GPS:
 *   1. LIVE mode   — real driver mobile GPS via Socket.IO events
 *   2. SIMULATION  — fallback for buses without an active driver session
 *
 * Event flow:
 *   Driver client → driver:start-trip    (with JWT token)
 *   Driver client → driver:location-update { busId, latitude, longitude, accuracy, timestamp }
 *   Driver client → driver:end-trip
 *
 *   Server → all:  bus:location-update
 *   Server → all:  bus:status-update
 *   Server → all:  pickup:update
 */

const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const BusModel   = require('../models/busModel');
const RouteModel = require('../models/routeModel');
const db         = require('../config/db');

// ── Active driver sessions: driverId → { busId, socketId, lastUpdate } ────────
const activeDriverSessions = new Map();

// ── Offline detection timeout (30 seconds) ────────────────────────────────────
const OFFLINE_TIMEOUT_MS = 30_000;
const offlineTimers = new Map(); // busId → timer

function clearOfflineTimer(busId) {
  const t = offlineTimers.get(busId);
  if (t) { clearTimeout(t); offlineTimers.delete(busId); }
}

function scheduleOfflineCheck(io, busId, driverId) {
  clearOfflineTimer(busId);
  const timer = setTimeout(() => {
    // Driver disappeared — mark bus offline
    try {
      db.prepare("UPDATE buses SET status = 'offline' WHERE bus_id = ?").run(busId);
    } catch (_) {}
    activeDriverSessions.delete(driverId);
    offlineTimers.delete(busId);
    io.emit('bus:status-update', {
      bus_id: busId,
      status: 'offline',
      trip_status: 'DRIVER DISCONNECTED',
      mode: 'OFFLINE',
      timestamp: new Date().toISOString()
    });
    console.log(`⚠️  Bus ${busId} marked OFFLINE — driver GPS timeout`);
  }, OFFLINE_TIMEOUT_MS);
  offlineTimers.set(busId, timer);
}

// ── Verify JWT token from socket handshake ────────────────────────────────────
function verifyToken(token) {
  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (_) {
    return null;
  }
}

// ── GPS Simulation helpers ────────────────────────────────────────────────────
const busSimState = {};

function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function haversineDistance(a, b) {
  const R = 6371e3;
  const φ1 = a.lat * Math.PI / 180;
  const φ2 = b.lat * Math.PI / 180;
  const Δφ = (b.lat - a.lat) * Math.PI / 180;
  const Δλ = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function calculateETA(currentLat, currentLng, stopLat, stopLng, speedKmh = 30) {
  const dist = haversineDistance(
    { lat: currentLat, lng: currentLng },
    { lat: stopLat, lng: stopLng }
  );
  return Math.round((dist / 1000 / speedKmh) * 60);
}

// ── Main export ───────────────────────────────────────────────────────────────
module.exports = function setupTrackingSocket(io) {
  const ns = io.of('/');

  ns.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ── Students / generic subscribers ──────────────────────────────────────
    socket.on('subscribe-bus', (busId) => {
      socket.join(`bus-${busId}`);
    });

    socket.on('unsubscribe-bus', (busId) => {
      socket.leave(`bus-${busId}`);
    });

    // ── DRIVER: Start Trip ───────────────────────────────────────────────────
    socket.on('driver:start-trip', ({ token, busId }) => {
      const user = verifyToken(token);
      if (!user || user.role !== 'driver') {
        socket.emit('driver:error', { message: 'Unauthorized. Valid driver token required.' });
        return;
      }

      // Verify driver owns this bus
      const bus = db.prepare('SELECT * FROM buses WHERE bus_id = ? AND driver_id = ?').get(busId, user.id);
      if (!bus) {
        socket.emit('driver:error', { message: 'You are not assigned to this bus.' });
        return;
      }

      // Register session
      activeDriverSessions.set(user.id, { busId, socketId: socket.id, lastUpdate: Date.now() });
      socket.join(`driver-${user.id}`);

      console.log(`🚌 Driver ${user.id} started GPS session for bus ${busId}`);

      // Update bus status if not already running
      try {
        db.prepare("UPDATE buses SET status = 'running' WHERE bus_id = ?").run(busId);
      } catch (_) {}

      // Broadcast
      io.emit('bus:status-update', {
        bus_id: busId,
        bus_number: bus.bus_number,
        status: 'running',
        mode: 'LIVE',
        trip_status: 'LIVE',
        timestamp: new Date().toISOString()
      });

      socket.emit('driver:trip-started', { bus_id: busId, bus_number: bus.bus_number });

      // Start offline watchdog
      scheduleOfflineCheck(io, busId, user.id);
    });

    // ── DRIVER: Location Update ──────────────────────────────────────────────
    socket.on('driver:location-update', ({ token, busId, latitude, longitude, accuracy, timestamp }) => {
      const user = verifyToken(token);
      if (!user || user.role !== 'driver') {
        socket.emit('driver:error', { message: 'Unauthorized.' });
        return;
      }

      // Verify this driver's session matches the busId
      const session = activeDriverSessions.get(user.id);
      if (!session || session.busId !== parseInt(busId)) {
        socket.emit('driver:error', { message: 'No active trip for this bus.' });
        return;
      }

      // Update session timestamp
      session.lastUpdate = Date.now();
      session.socketId = socket.id;

      // Persist to DB
      try {
        BusModel.updateLocation(busId, latitude, longitude, 0);
      } catch (_) {}

      // Build ETA data from stops
      let etaData = [];
      try {
        const bus = db.prepare('SELECT * FROM buses WHERE bus_id = ?').get(busId);
        if (bus?.route_id) {
          const stops = RouteModel.getStops(bus.route_id);
          etaData = stops.map((stop, i) => ({
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            eta_minutes: calculateETA(latitude, longitude, stop.latitude, stop.longitude) + i
          }));
        }
      } catch (_) {}

      // Build payload
      const bus = db.prepare(`
        SELECT b.bus_id, b.bus_number, b.available_seats, b.capacity, r.route_name
        FROM buses b LEFT JOIN routes r ON b.route_id = r.route_id WHERE b.bus_id = ?
      `).get(busId);

      const payload = {
        bus_id: parseInt(busId),
        bus_number: bus?.bus_number || `BUS-${busId}`,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy || null,
        speed: 0,
        status: 'running',
        mode: 'LIVE',                   // ← Real driver GPS
        trip_status: 'LIVE',
        available_seats: bus?.available_seats,
        capacity: bus?.capacity,
        route_name: bus?.route_name,
        eta: etaData,
        timestamp: timestamp || new Date().toISOString()
      };

      // Broadcast to all connected clients
      io.emit('bus:location-update', payload);

      // Reset offline timer (driver is still alive)
      scheduleOfflineCheck(io, parseInt(busId), user.id);
    });

    // ── DRIVER: End Trip ────────────────────────────────────────────────────
    socket.on('driver:end-trip', ({ token, busId }) => {
      const user = verifyToken(token);
      if (!user || user.role !== 'driver') {
        socket.emit('driver:error', { message: 'Unauthorized.' });
        return;
      }

      const session = activeDriverSessions.get(user.id);
      if (!session) {
        socket.emit('driver:error', { message: 'No active trip found.' });
        return;
      }

      const effectiveBusId = session.busId;
      activeDriverSessions.delete(user.id);
      clearOfflineTimer(effectiveBusId);

      // End trip in DB
      try {
        db.prepare("UPDATE buses SET status = 'inactive', active_trip_id = NULL WHERE bus_id = ?").run(effectiveBusId);
        db.prepare("UPDATE trips SET status = 'completed', end_time = datetime('now') WHERE bus_id = ? AND status = 'running'").run(effectiveBusId);
      } catch (_) {}

      console.log(`✅ Driver ${user.id} ended GPS session for bus ${effectiveBusId}`);

      const bus = db.prepare('SELECT bus_number FROM buses WHERE bus_id = ?').get(effectiveBusId);

      io.emit('bus:status-update', {
        bus_id: effectiveBusId,
        bus_number: bus?.bus_number,
        status: 'inactive',
        mode: 'OFFLINE',
        trip_status: 'TRIP COMPLETED',
        timestamp: new Date().toISOString()
      });

      socket.emit('driver:trip-ended', { bus_id: effectiveBusId });
    });

    // ── Manager manual location update (legacy support) ─────────────────────
    socket.on('update-location', ({ bus_id, latitude, longitude, speed }) => {
      try {
        BusModel.updateLocation(bus_id, latitude, longitude, speed || 0);
        io.to(`bus-${bus_id}`).emit('bus:location-update', {
          bus_id, latitude, longitude, speed: speed || 0,
          mode: 'LIVE',
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    // ── Disconnect handler ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      // Check if this was a driver — if so start offline countdown
      for (const [driverId, session] of activeDriverSessions.entries()) {
        if (session.socketId === socket.id) {
          console.log(`⚠️  Driver ${driverId} disconnected unexpectedly. Starting offline countdown...`);
          scheduleOfflineCheck(io, session.busId, driverId);
          break;
        }
      }
    });
  });

  // ── GPS Simulation loop — ONLY for buses WITHOUT active driver sessions ────
  const interval = parseInt(process.env.GPS_SIMULATION_INTERVAL) || 4000;

  setInterval(() => {
    try {
      const allBuses = BusModel.findAll();
      const activeDriverBusIds = new Set([...activeDriverSessions.values()].map(s => s.busId));

      // Only simulate buses that have no live driver
      const simulatedBuses = allBuses.filter(b =>
        b.route_id && !activeDriverBusIds.has(b.bus_id)
      );

      simulatedBuses.forEach(bus => {
        const stops = RouteModel.getStops(bus.route_id);
        if (!stops || stops.length < 2) return;

        if (!busSimState[bus.bus_id]) {
          busSimState[bus.bus_id] = { stopIndex: 0, progress: 0 };
        }

        const state = busSimState[bus.bus_id];
        const fromStop = stops[state.stopIndex];
        const toStop   = stops[(state.stopIndex + 1) % stops.length];

        state.progress += 0.04 + Math.random() * 0.04;
        if (state.progress >= 1) {
          state.progress = 0;
          state.stopIndex = (state.stopIndex + 1) % (stops.length - 1 || 1);
        }

        const pos = interpolate(
          { lat: fromStop.latitude, lng: fromStop.longitude },
          { lat: toStop.latitude,   lng: toStop.longitude   },
          state.progress
        );

        const speed = 20 + Math.random() * 15;
        BusModel.updateLocation(bus.bus_id, pos.lat, pos.lng, speed);

        const etaData = stops.slice(state.stopIndex + 1).map((stop, i) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          eta_minutes: calculateETA(pos.lat, pos.lng, stop.latitude, stop.longitude, speed) + i * 2
        }));

        io.emit('bus:location-update', {
          bus_id: bus.bus_id,
          bus_number: bus.bus_number,
          latitude:  pos.lat,
          longitude: pos.lng,
          speed: Math.round(speed),
          status: 'inactive',      // simulation only — bus not officially "running"
          mode: 'SIMULATION',      // ← clearly labeled as demo
          trip_status: 'DEMO MODE',
          available_seats: bus.available_seats,
          capacity: bus.capacity,
          eta: etaData,
          timestamp: new Date().toISOString()
        });
      });
    } catch (_) {
      // Simulation is non-critical
    }
  }, interval);

  console.log(`🛰️  Socket.IO tracking initialized (GPS simulation every ${interval}ms, LIVE mode ready)`);

  // Export session map for other modules if needed
  return { activeDriverSessions };
};
