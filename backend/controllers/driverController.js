/**
 * Driver Controller — Review 1
 * Handles: assigned bus, trip start/end, pickup point management
 * All driver GPS tracking goes through Socket.IO (not HTTP)
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const DriverModel = require('../models/driverModel');
const gpsValidationService = require('../services/gpsValidationService');
const { ROLES, normalizeRole } = require('../utils/roles');

// ── GET ALL DRIVERS (Admin: all, Manager: assigned drivers only) ──────────────
const getAllDrivers = (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role === ROLES.MANAGER) {
      const drivers = db.prepare(`
        SELECT d.driver_id, d.name, d.email, d.phone, d.license_number, d.address,
               d.is_active, d.created_at,
               b.bus_id, b.bus_number, b.status as bus_status
        FROM drivers d
        JOIN buses b ON b.driver_id = d.driver_id
        WHERE b.manager_id = ?
        ORDER BY d.name
      `).all(req.user.id);
      return res.json({ success: true, data: drivers });
    }

    const drivers = db.prepare(`
      SELECT d.driver_id, d.name, d.email, d.phone, d.license_number, d.address,
             d.is_active, d.created_at,
             b.bus_id, b.bus_number, b.status as bus_status
      FROM drivers d
      LEFT JOIN buses b ON b.driver_id = d.driver_id
      ORDER BY d.name
    `).all();
    res.json({ success: true, data: drivers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET SINGLE DRIVER ─────────────────────────────────────────────────────────
const getDriver = (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role === ROLES.MANAGER) {
      const driverBus = db.prepare('SELECT bus_id FROM buses WHERE driver_id = ? AND manager_id = ?').get(req.params.id, req.user.id);
      if (!driverBus) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this driver. You can only view drivers assigned to your buses.'
        });
      }
    }

    const driver = db.prepare(`
      SELECT d.driver_id, d.name, d.email, d.phone, d.license_number, d.address, d.is_active, d.created_at
      FROM drivers d WHERE d.driver_id = ?
    `).get(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── CREATE DRIVER (Admin only, with login credentials) ────────────────────────
const createDriver = async (req, res) => {
  try {
    const { name, email, password, phone, license_number, address } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });

    const hashedPwd = password ? await bcrypt.hash(password, 10) : null;
    const result = db.prepare(`
      INSERT INTO drivers (name, email, password, phone, license_number, address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, email || null, hashedPwd, phone || null, license_number || null, address || null);

    res.status(201).json({ success: true, message: 'Driver created.', id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'Email or license number already exists.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE DRIVER ─────────────────────────────────────────────────────────────
const updateDriver = async (req, res) => {
  try {
    const { name, email, phone, license_number, address, password, is_active } = req.body;
    let hashedPwd = undefined;
    if (password) hashedPwd = await bcrypt.hash(password, 10);

    db.prepare(`
      UPDATE drivers SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        license_number = COALESCE(?, license_number),
        address = COALESCE(?, address),
        is_active = COALESCE(?, is_active)
        ${hashedPwd ? ', password = ?' : ''}
      WHERE driver_id = ?
    `).run(
      name || null, email || null, phone || null,
      license_number || null, address || null,
      is_active !== undefined ? is_active : null,
      ...(hashedPwd ? [hashedPwd] : []),
      req.params.id
    );
    res.json({ success: true, message: 'Driver updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TOGGLE DRIVER ACTIVE/INACTIVE (Admin only) ────────────────────────────────
const toggleDriverActive = (req, res) => {
  try {
    const driver = db.prepare('SELECT * FROM drivers WHERE driver_id = ?').get(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    const newStatus = driver.is_active ? 0 : 1;
    db.prepare('UPDATE drivers SET is_active = ? WHERE driver_id = ?').run(newStatus, req.params.id);
    res.json({ success: true, message: newStatus ? 'Driver enabled.' : 'Driver disabled.', is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE DRIVER ─────────────────────────────────────────────────────────────
const deleteDriver = (req, res) => {
  try {
    db.prepare('DELETE FROM drivers WHERE driver_id = ?').run(req.params.id);
    res.json({ success: true, message: 'Driver deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MY ASSIGNED BUS (Driver only) ─────────────────────────────────────────
const getMyBus = (req, res) => {
  try {
    const bus = db.prepare(`
      SELECT b.bus_id, b.bus_number, b.registration_number, b.capacity, b.available_seats,
             b.status, b.active_trip_id, b.current_latitude, b.current_longitude,
             b.route_id, r.route_name, r.source, r.destination, r.distance
      FROM buses b
      LEFT JOIN routes r ON b.route_id = r.route_id
      WHERE b.driver_id = ?
    `).get(req.user.id);

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'No bus assigned to you. Contact your admin.'
      });
    }

    // Get route stops
    const stops = bus.route_id
      ? db.prepare('SELECT * FROM bus_stops WHERE route_id = ? ORDER BY stop_order').all(bus.route_id)
      : [];

    // Get pickup points for this bus
    const pickupPoints = db.prepare(`
      SELECT * FROM pickup_points WHERE bus_id = ? ORDER BY created_at DESC
    `).all(bus.bus_id);

    res.json({ success: true, data: { ...bus, stops, pickup_points: pickupPoints } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── START TRIP (Driver only) ──────────────────────────────────────────────────
const startTrip = (req, res) => {
  try {
    const { route_id, bus_id } = req.body;

    const targetBusId = bus_id ? parseInt(bus_id) : null;
    const driverBus = db.prepare('SELECT bus_id, bus_number FROM buses WHERE driver_id = ?').get(req.user.id);

    if (!driverBus) {
      return res.status(403).json({ success: false, message: 'No bus assigned to your driver account.' });
    }

    if (targetBusId && targetBusId !== driverBus.bus_id) {
      return res.status(403).json({
        success: false,
        message: `You are not assigned to bus #${targetBusId}. You are only authorized to operate your assigned bus (${driverBus.bus_number}).`
      });
    }

    const effectiveBusId = driverBus.bus_id;


    // Strict Anti-Fake Trip Validation:
    // Ensures authenticated driver, driver assignment, bus route assignment, no duplicate trips
    const validation = gpsValidationService.validateTripStart({
      driverId: req.user.id,
      busId: effectiveBusId,
      routeId: route_id ? parseInt(route_id) : null
    });

    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { bus, routeId: effectiveRouteId } = validation;

    // Create trip with initial state 'STARTING' (becomes 'LIVE' only once authentic GPS arrives)
    const result = db.prepare(`
      INSERT INTO trips (bus_id, driver_id, route_id, start_time, status, gps_mode, trip_state)
      VALUES (?, ?, ?, datetime('now'), 'running', 'LIVE', 'STARTING')
    `).run(bus.bus_id, req.user.id, effectiveRouteId);

    const tripId = result.lastInsertRowid;

    // Update bus: state is STARTING until first valid GPS fix
    db.prepare(`
      UPDATE buses SET
        status = 'running',
        active_trip_id = ?,
        route_id = ?,
        tracking_status = 'STARTING',
        trip_state = 'STARTING'
      WHERE bus_id = ?
    `).run(tripId, effectiveRouteId, bus.bus_id);

    // Broadcast via Socket.IO
    if (req.io) {
      req.io.emit('bus:status-update', {
        bus_id: bus.bus_id,
        bus_number: bus.bus_number,
        status: 'running',
        mode: 'LIVE',
        trip_status: 'STARTING',
        trip_state: 'STARTING',
        trip_id: tripId,
        timestamp: new Date().toISOString()
      });
    }

    req.logActivity?.('TRIP_STARTED', `Driver started trip #${tripId} for ${bus.bus_number}`);
    res.status(201).json({

      success: true,
      message: 'Trip initiated. Awaiting GPS location feed to verify LIVE status.',
      trip_id: tripId,
      bus_id: bus.bus_id,
      route_id: effectiveRouteId
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── END TRIP (Driver only) ────────────────────────────────────────────────────
const endTrip = (req, res) => {
  try {
    const bus = db.prepare('SELECT * FROM buses WHERE driver_id = ?').get(req.user.id);
    if (!bus) return res.status(404).json({ success: false, message: 'No bus assigned.' });

    if (bus.active_trip_id) {
      db.prepare(`
        UPDATE trips SET
          status = 'completed',
          trip_state = 'COMPLETED',
          end_time = datetime('now')
        WHERE trip_id = ?
      `).run(bus.active_trip_id);
    }

    db.prepare(`
      UPDATE buses SET
        status = 'inactive',
        active_trip_id = NULL,
        tracking_status = 'COMPLETED',
        trip_state = 'COMPLETED'
      WHERE bus_id = ?
    `).run(bus.bus_id);

    // Broadcast trip completed
    if (req.io) {
      req.io.emit('bus:status-update', {
        bus_id: bus.bus_id,
        bus_number: bus.bus_number,
        status: 'inactive',
        trip_status: 'TRIP COMPLETED',
        trip_state: 'COMPLETED',
        mode: 'OFFLINE',
        timestamp: new Date().toISOString()
      });
    }

    req.logActivity?.('TRIP_COMPLETED', `Driver ended trip for ${bus.bus_number}`);
    res.json({ success: true, message: 'Trip ended successfully.' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET PICKUP POINTS ─────────────────────────────────────────────────────────
const getPickupPoints = (req, res) => {
  try {
    const { bus_id, route_id, trip_id } = req.query;
    let query = 'SELECT * FROM pickup_points WHERE 1=1';
    const params = [];
    if (bus_id)   { query += ' AND bus_id = ?';   params.push(bus_id); }
    if (route_id) { query += ' AND route_id = ?';  params.push(route_id); }
    if (trip_id)  { query += ' AND trip_id = ?';   params.push(trip_id); }
    query += ' ORDER BY created_at ASC';
    const points = db.prepare(query).all(...params);
    res.json({ success: true, data: points });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADD PICKUP POINT (Driver only, for their own bus) ─────────────────────────
const addPickupPoint = (req, res) => {
  try {
    const { name, description, latitude, longitude, route_id, trip_id } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'name, latitude, longitude are required.' });
    }

    const bus = db.prepare('SELECT * FROM buses WHERE driver_id = ?').get(req.user.id);
    if (!bus) return res.status(404).json({ success: false, message: 'No bus assigned.' });

    const result = db.prepare(`
      INSERT INTO pickup_points (route_id, trip_id, bus_id, name, description, latitude, longitude, created_by_driver_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      route_id || bus.route_id || null,
      trip_id || bus.active_trip_id || null,
      bus.bus_id,
      name, description || null,
      parseFloat(latitude), parseFloat(longitude),
      req.user.id
    );

    const newPoint = db.prepare('SELECT * FROM pickup_points WHERE pickup_id = ?').get(result.lastInsertRowid);

    // Broadcast to students
    if (req.io) {
      req.io.emit('pickup:update', {
        action: 'add',
        bus_id: bus.bus_id,
        pickup_point: newPoint,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({ success: true, message: 'Pickup point added.', data: newPoint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE PICKUP POINT ───────────────────────────────────────────────────────
const deletePickupPoint = (req, res) => {
  try {
    const point = db.prepare('SELECT * FROM pickup_points WHERE pickup_id = ?').get(req.params.id);
    if (!point) return res.status(404).json({ success: false, message: 'Pickup point not found.' });

    // Drivers can only delete their own pickup points
    if (normalizeRole(req.user.role) === ROLES.DRIVER && point.created_by_driver_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Cannot delete another driver\'s pickup point.' });
    }


    db.prepare('DELETE FROM pickup_points WHERE pickup_id = ?').run(req.params.id);

    if (req.io) {
      req.io.emit('pickup:update', {
        action: 'delete',
        bus_id: point.bus_id,
        pickup_id: parseInt(req.params.id),
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Pickup point deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllDrivers, getDriver, createDriver, updateDriver, deleteDriver, toggleDriverActive,
  getMyBus, startTrip, endTrip,
  getPickupPoints, addPickupPoint, deletePickupPoint
};
