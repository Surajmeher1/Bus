/**
 * trackingSocket.js
 * High-reliability real-time tracking engine for GIET Smart University Bus Tracking System
 *
 * Core Capabilities:
 * 1. Strict Driver Authentication & Bus Ownership verification
 * 2. Anti-Fake-Bus & GPS validation (bounds, timestamp freshness, teleportation/jump detection)
 * 3. Server-side Polygon Geofence checking (detects & alerts outside operating area)
 * 4. Stop sequence route-progress, ETA to next stop, ETA to college/campus
 * 5. Next bus arrival scheduling when bus reaches stop or college
 * 6. Configurable watchdog timeout (30-60s) transitioning un-updated buses to GPS_LOST/OFFLINE
 * 7. Simulation strictly controlled by ENABLE_GPS_SIMULATION flag
 */

const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { ROLES, normalizeRole } = require('../utils/roles');
const BusModel   = require('../models/busModel');
const RouteModel = require('../models/routeModel');
const db         = require('../config/db');
const geofenceService = require('../services/geofenceService');
const gpsValidationService = require('../services/gpsValidationService');
const etaService = require('../services/etaService');


// Active driver sessions: driverId -> { busId, socketId, lastUpdate }
const activeDriverSessions = new Map();

// Configurable watchdog timeout (default 45s, 30-60s range)
const OFFLINE_TIMEOUT_MS = (parseInt(process.env.GPS_TIMEOUT_SECONDS) || 45) * 1000;
const offlineTimers = new Map(); // busId -> timer

function clearOfflineTimer(busId) {
  const t = offlineTimers.get(busId);
  if (t) { clearTimeout(t); offlineTimers.delete(busId); }
}

function scheduleOfflineCheck(io, busId, driverId) {
  clearOfflineTimer(busId);
  const timer = setTimeout(() => {
    // Driver GPS lost / timed out
    try {
      db.prepare(`
        UPDATE buses SET
          status = 'offline',
          tracking_status = 'GPS_LOST',
          trip_state = 'GPS_LOST'
        WHERE bus_id = ?
      `).run(busId);

      db.prepare(`
        UPDATE trips SET
          trip_state = 'GPS_LOST'
        WHERE bus_id = ? AND status = 'running'
      `).run(busId);
    } catch (_) {}

    activeDriverSessions.delete(driverId);
    offlineTimers.delete(busId);

    const bus = db.prepare('SELECT bus_number FROM buses WHERE bus_id = ?').get(busId);

    io.emit('bus:status-update', {
      bus_id: busId,
      bus_number: bus?.bus_number || `BUS-${busId}`,
      status: 'offline',
      tracking_status: 'GPS_LOST',
      trip_status: 'GPS LOST / OFFLINE',
      trip_state: 'GPS_LOST',
      mode: 'OFFLINE',
      timestamp: new Date().toISOString()
    });

    console.log(`⚠️  Bus ${busId} (${bus?.bus_number}) marked GPS_LOST/OFFLINE — GPS timeout`);
  }, OFFLINE_TIMEOUT_MS);

  offlineTimers.set(busId, timer);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (_) {
    return null;
  }
}

module.exports = function setupTrackingSocket(io) {
  const ns = io.of('/');

  ns.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Room subscription
    socket.on('subscribe-bus', (busId) => {
      socket.join(`bus-${busId}`);
    });

    socket.on('unsubscribe-bus', (busId) => {
      socket.leave(`bus-${busId}`);
    });

    // ── DRIVER: Start Trip ───────────────────────────────────────────────────
    socket.on('driver:start-trip', ({ token, busId }) => {
      const user = verifyToken(token);
      if (!user || normalizeRole(user.role) !== ROLES.DRIVER) {
        socket.emit('driver:error', { message: 'Unauthorized. Valid driver token required.' });
        return;
      }

      // Verify driver exists & is active in database
      const driver = db.prepare('SELECT driver_id, name, is_active FROM drivers WHERE driver_id = ?').get(user.id);
      if (!driver || !driver.is_active) {
        socket.emit('driver:error', { message: 'Driver account is inactive or not found.' });
        return;
      }

      // Verify bus exists & driver is assigned
      const bus = db.prepare('SELECT * FROM buses WHERE bus_id = ?').get(busId);
      if (!bus) {
        socket.emit('driver:error', { message: 'Bus not found.' });
        return;
      }

      if (bus.driver_id !== user.id) {
        socket.emit('driver:error', {
          message: `You are not assigned to ${bus.bus_number}. Only the assigned driver can start this bus.`
        });
        return;
      }

      // Check if active trip exists and is owned by this driver
      const activeTrip = db.prepare("SELECT * FROM trips WHERE bus_id = ? AND driver_id = ? AND status = 'running'").get(busId, user.id);
      if (!activeTrip) {
        socket.emit('driver:error', { message: 'No active trip initialized. Please start trip from the dashboard first.' });
        return;
      }

      // Register live driver session
      activeDriverSessions.set(user.id, { busId: parseInt(busId), socketId: socket.id, lastUpdate: Date.now() });
      socket.join(`driver-${user.id}`);

      console.log(`🚌 Driver ${user.id} registered live GPS session for ${bus.bus_number}`);

      // Set initial state to STARTING (bus becomes LIVE upon first valid GPS coordinate reception)
      try {
        db.prepare(`
          UPDATE buses SET
            status = 'running',
            tracking_status = 'STARTING',
            trip_state = 'STARTING'
          WHERE bus_id = ?
        `).run(busId);
      } catch (_) {}

      io.emit('bus:status-update', {
        bus_id: parseInt(busId),
        bus_number: bus.bus_number,
        status: 'running',
        tracking_status: 'STARTING',
        trip_status: 'STARTING SOON',
        trip_state: 'STARTING',
        mode: 'LIVE',
        timestamp: new Date().toISOString()
      });

      socket.emit('driver:trip-started', { bus_id: parseInt(busId), bus_number: bus.bus_number });

      // Start watchdog timer
      scheduleOfflineCheck(io, parseInt(busId), user.id);
    });

    // ── DRIVER: Location Update ──────────────────────────────────────────────
    socket.on('driver:location-update', ({ token, busId, latitude, longitude, accuracy, timestamp }) => {
      const user = verifyToken(token);
      if (!user || normalizeRole(user.role) !== ROLES.DRIVER) {
        socket.emit('driver:error', { message: 'Unauthorized driver token. Only drivers can submit GPS.' });
        return;
      }

      // Verify driver exists & is active in database
      const driver = db.prepare('SELECT driver_id, name, is_active FROM drivers WHERE driver_id = ?').get(user.id);
      if (!driver || !driver.is_active) {
        socket.emit('driver:error', { message: 'Driver account is inactive or not found.' });
        return;
      }

      const parsedBusId = parseInt(busId);

      // Verify bus exists and is assigned to this driver
      const busAssigned = db.prepare('SELECT bus_id, driver_id FROM buses WHERE bus_id = ?').get(parsedBusId);
      if (!busAssigned || busAssigned.driver_id !== user.id) {
        socket.emit('driver:error', { message: 'You are not assigned to this bus.' });
        return;
      }

      const session = activeDriverSessions.get(user.id);
      if (!session || session.busId !== parsedBusId) {
        socket.emit('driver:error', { message: 'No active authorized trip session for this bus.' });
        return;
      }

      // Verify active trip record in DB is assigned to this driver
      const activeTrip = db.prepare("SELECT * FROM trips WHERE bus_id = ? AND driver_id = ? AND status = 'running'").get(parsedBusId, user.id);
      if (!activeTrip) {
        socket.emit('driver:error', { message: 'Trip has already ended or is not assigned to this driver.' });
        return;
      }


      // Server-side GPS Validation (Anti-Fake-Bus verification)
      const gpsCheck = gpsValidationService.validateGpsReading({
        busId: parsedBusId,
        latitude,
        longitude,
        accuracy,
        timestamp
      });

      if (!gpsCheck.valid) {
        if (gpsCheck.isSuspicious) {
          console.warn(`🚨 Suspicious GPS from driver ${user.id} for bus ${parsedBusId}: ${gpsCheck.suspicionReason}`);
          db.prepare(`
            INSERT INTO activity_logs (user_type, user_id, action, details)
            VALUES ('driver', ?, 'suspicious_gps', ?)
          `).run(user.id, `Suspicious GPS update on bus #${parsedBusId}: ${gpsCheck.suspicionReason} (${latitude}, ${longitude})`);

          // Mark trip suspicious count
          db.prepare('UPDATE trips SET suspicious_count = COALESCE(suspicious_count, 0) + 1 WHERE trip_id = ?')
            .run(activeTrip.trip_id);

          socket.emit('driver:warning', { message: 'Suspicious GPS jump detected. Maintaining previous verified location.' });
        }
        // Do not update location with corrupted reading
        return;
      }

      session.lastUpdate = Date.now();
      session.socketId = socket.id;

      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);
      const speedNum = gpsCheck.calculatedSpeedKmh || 0;

      // Fetch bus details & driver name
      const bus = db.prepare(`
        SELECT b.*, r.route_name, r.source, r.destination, d.name as driver_name, d.phone as driver_phone
        FROM buses b
        LEFT JOIN routes r ON b.route_id = r.route_id
        LEFT JOIN drivers d ON b.driver_id = d.driver_id
        WHERE b.bus_id = ?
      `).get(parsedBusId);

      // Polygon Geofence Validation: Check if bus is inside configured operating area
      const geofenceResult = geofenceService.checkBusLocation({
        busId: parsedBusId,
        driverId: user.id,
        tripId: activeTrip.trip_id,
        latitude: latNum,
        longitude: lngNum,
        busNumber: bus?.bus_number,
        driverName: bus?.driver_name,
        io
      });

      let currentTrackingStatus = 'LIVE';
      let currentTripStatusText = 'LIVE';

      if (!geofenceResult.isInside) {
        currentTrackingStatus = 'OUTSIDE_AREA';
        currentTripStatusText = 'OUTSIDE OPERATING AREA';
      } else if (gpsCheck.isWeakGps) {
        currentTrackingStatus = 'GPS_WEAK';
        currentTripStatusText = 'GPS SIGNAL WEAK';
      }

      // Persist valid location & audit timestamps in database
      try {
        db.prepare(`
          UPDATE buses SET
            current_latitude = ?,
            current_longitude = ?,
            current_speed = ?,
            last_valid_latitude = ?,
            last_valid_longitude = ?,
            last_gps_timestamp = datetime('now'),
            status = 'running',
            tracking_status = ?,
            trip_state = ?
          WHERE bus_id = ?
        `).run(latNum, lngNum, speedNum, latNum, lngNum, currentTrackingStatus, currentTrackingStatus, parsedBusId);

        db.prepare(`
          UPDATE trips SET trip_state = ? WHERE trip_id = ?
        `).run(currentTrackingStatus, activeTrip.trip_id);
      } catch (e) {
        console.error('Failed to update bus location in DB:', e.message);
      }

      // Route stops and ETA calculation
      let etaPayload = {
        next_stop: null,
        college_stop: null,
        eta_next_stop_minutes: null,
        eta_college_minutes: null,
        route_progress_percent: 0,
        stops_timeline: [],
        current_stop_nearby: null,
        has_arrived: false
      };

      if (bus?.route_id) {
        const stops = RouteModel.getStops(bus.route_id);
        if (stops && stops.length > 0) {
          etaPayload = etaService.calculateRouteETAs(latNum, lngNum, stops, speedNum);
        }
      }

      // Next bus arrival prediction (when near stop or college)
      const nextBusInfo = etaService.getNextBusInfo(
        bus?.route_id,
        parsedBusId,
        etaPayload.current_stop_nearby || etaPayload.next_stop?.stop_name
      );

      // If arrived at final stop, adjust status
      if (etaPayload.has_arrived) {
        currentTripStatusText = 'ARRIVED AT DESTINATION';
        currentTrackingStatus = 'ARRIVED';
      }

      // Full Broadcast Payload to Students, Managers, and Admins
      const payload = {
        bus_id: parsedBusId,
        bus_number: bus?.bus_number || `BUS-${parsedBusId}`,
        registration_number: bus?.registration_number,
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracy ? Math.round(accuracy) : null,
        speed: speedNum,
        status: 'running',
        tracking_status: currentTrackingStatus,
        trip_status: currentTripStatusText,
        trip_state: currentTrackingStatus,
        mode: 'LIVE', // Verified authentic driver mobile GPS
        driver_name: bus?.driver_name,
        driver_phone: bus?.driver_phone,
        available_seats: bus?.available_seats,
        capacity: bus?.capacity,
        route_id: bus?.route_id,
        route_name: bus?.route_name,
        route_source: bus?.source,
        route_destination: bus?.destination,
        next_stop: etaPayload.next_stop,
        college_stop: etaPayload.college_stop,
        eta_next_stop_minutes: etaPayload.eta_next_stop_minutes,
        eta_college_minutes: etaPayload.eta_college_minutes,
        route_progress_percent: etaPayload.route_progress_percent,
        stops_timeline: etaPayload.stops_timeline,
        current_stop_nearby: etaPayload.current_stop_nearby,
        has_arrived: etaPayload.has_arrived,
        next_bus: nextBusInfo,
        geofence_status: geofenceResult.isInside ? 'INSIDE' : 'OUTSIDE_OPERATION_AREA',
        timestamp: timestamp || new Date().toISOString()
      };

      // Broadcast real-time location to all connected sockets
      io.emit('bus:location-update', payload);

      // Reset watchdog timer
      scheduleOfflineCheck(io, parsedBusId, user.id);
    });

    // ── DRIVER: End Trip ────────────────────────────────────────────────────
    socket.on('driver:end-trip', ({ token, busId }) => {
      const user = verifyToken(token);
      if (!user || normalizeRole(user.role) !== ROLES.DRIVER) {
        socket.emit('driver:error', { message: 'Unauthorized driver token.' });
        return;
      }


      const session = activeDriverSessions.get(user.id);
      const effectiveBusId = session ? session.busId : parseInt(busId);

      if (effectiveBusId) {
        activeDriverSessions.delete(user.id);
        clearOfflineTimer(effectiveBusId);

        try {
          db.prepare(`
            UPDATE buses SET
              status = 'inactive',
              active_trip_id = NULL,
              tracking_status = 'COMPLETED',
              trip_state = 'COMPLETED'
            WHERE bus_id = ?
          `).run(effectiveBusId);

          db.prepare(`
            UPDATE trips SET
              status = 'completed',
              trip_state = 'COMPLETED',
              end_time = datetime('now')
            WHERE bus_id = ? AND status = 'running'
          `).run(effectiveBusId);
        } catch (_) {}

        const bus = db.prepare('SELECT bus_number FROM buses WHERE bus_id = ?').get(effectiveBusId);

        io.emit('bus:status-update', {
          bus_id: effectiveBusId,
          bus_number: bus?.bus_number,
          status: 'inactive',
          tracking_status: 'COMPLETED',
          trip_status: 'TRIP COMPLETED',
          trip_state: 'COMPLETED',
          mode: 'OFFLINE',
          timestamp: new Date().toISOString()
        });

        socket.emit('driver:trip-ended', { bus_id: effectiveBusId });
        console.log(`✅ Driver ${user.id} ended trip for bus ${effectiveBusId}`);
      }
    });

    // ── Disconnect handler ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [driverId, session] of activeDriverSessions.entries()) {
        if (session.socketId === socket.id) {
          console.log(`⚠️  Driver ${driverId} socket disconnected. Running ${OFFLINE_TIMEOUT_MS/1000}s watchdog...`);
          scheduleOfflineCheck(io, session.busId, driverId);
          break;
        }
      }
    });
  });

  // ── GPS Simulation: STRICTLY OPT-IN VIA ENV FLAG ──────────────────────────
  // Per requirements: Do not use fake GPS simulation for normal production tracking.
  const enableSimulation = process.env.ENABLE_GPS_SIMULATION === 'true';
  if (enableSimulation) {
    const interval = parseInt(process.env.GPS_SIMULATION_INTERVAL) || 4000;
    const busSimState = {};

    setInterval(() => {
      try {
        const allBuses = BusModel.findAll();
        const activeDriverBusIds = new Set([...activeDriverSessions.values()].map(s => s.busId));
        const simulatedBuses = allBuses.filter(b => b.route_id && !activeDriverBusIds.has(b.bus_id));

        simulatedBuses.forEach(bus => {
          const stops = RouteModel.getStops(bus.route_id);
          if (!stops || stops.length < 2) return;

          if (!busSimState[bus.bus_id]) {
            busSimState[bus.bus_id] = { stopIndex: 0, progress: 0 };
          }
          const state = busSimState[bus.bus_id];
          const fromStop = stops[state.stopIndex];
          const toStop   = stops[(state.stopIndex + 1) % stops.length];

          state.progress += 0.05;
          if (state.progress >= 1) {
            state.progress = 0;
            state.stopIndex = (state.stopIndex + 1) % (stops.length - 1 || 1);
          }

          const curLat = fromStop.latitude + (toStop.latitude - fromStop.latitude) * state.progress;
          const curLng = fromStop.longitude + (toStop.longitude - fromStop.longitude) * state.progress;

          const etaData = stops.slice(state.stopIndex + 1).map((s, i) => ({
            stop_id: s.stop_id,
            stop_name: s.stop_name,
            eta_minutes: (i + 1) * 3
          }));

          io.emit('bus:location-update', {
            bus_id: bus.bus_id,
            bus_number: bus.bus_number,
            latitude: curLat,
            longitude: curLng,
            speed: 25,
            status: 'inactive',
            tracking_status: 'SIMULATION',
            mode: 'SIMULATION',
            trip_status: 'DEMO MODE',
            available_seats: bus.available_seats,
            capacity: bus.capacity,
            route_name: bus.route_name,
            eta: etaData,
            timestamp: new Date().toISOString()
          });
        });
      } catch (_) {}
    }, interval);
    console.log(`📡 GPS Simulation active for testing (${interval}ms)`);
  } else {
    console.log(`🔒 Authentic GPS Tracking Active — Fake GPS Simulation disabled`);
  }

  return { activeDriverSessions };
};
