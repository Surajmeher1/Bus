const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const db = require('../config/db');
const { ROLES, normalizeRole } = require('../utils/roles');

/**
 * Verify JWT token and attach decoded payload with normalized role to req.user.
 * Also verifies that the user still exists in the database and is active.
 * Invalidate session immediately if user account was deleted or deactivated.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    const role = normalizeRole(decoded.role);

    // Verify user still exists in database (immediately invalidates deleted user tokens)
    let userExists = false;
    let isActive = true;

    if (role === ROLES.ADMIN) {
      const admin = db.prepare('SELECT admin_id FROM admins WHERE admin_id = ?').get(decoded.id);
      userExists = !!admin;
    } else if (role === ROLES.DRIVER) {
      const driver = db.prepare('SELECT driver_id, is_active FROM drivers WHERE driver_id = ?').get(decoded.id);
      userExists = !!driver;
      if (driver && !driver.is_active) isActive = false;
    } else if (role === ROLES.MANAGER) {
      const manager = db.prepare('SELECT manager_id FROM managers WHERE manager_id = ?').get(decoded.id);
      userExists = !!manager;
    } else if (role === ROLES.STUDENT) {
      const student = db.prepare('SELECT student_id FROM students WHERE student_id = ?').get(decoded.id);
      userExists = !!student;
    }

    if (!userExists) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists. Please login again.'
      });
    }

    if (!isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Contact your administrator.'
      });
    }

    req.user = {
      ...decoded,
      role: role // Standard uppercase representation
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Reusable role authorization: authorize('ADMIN') or authorize('ADMIN', 'MANAGER')
 * Rejects unauthorized roles with 403 Forbidden and logs unauthorized access attempts.
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const normalizedAllowed = roles.map(r => normalizeRole(r));
  const userRole = normalizeRole(req.user.role);

  if (!normalizedAllowed.includes(userRole)) {
    // Record unauthorized access attempt in audit log
    const attemptedAction = `${req.method} ${req.originalUrl || req.url}`;
    const details = `User #${req.user.id} (${userRole}) attempted unauthorized access to: ${attemptedAction}. Required: ${normalizedAllowed.join(', ')}`;
    try {
      if (typeof req.logActivity === 'function') {
        req.logActivity('UNAUTHORIZED_ACCESS_ATTEMPT', details);
      } else {
        db.prepare(`
          INSERT INTO activity_logs (user_type, user_id, action, details, ip_address)
          VALUES (?, ?, 'UNAUTHORIZED_ACCESS_ATTEMPT', ?, ?)
        `).run(userRole.toLowerCase(), req.user.id, details, req.ip || 'unknown');
      }
    } catch (_) {}

    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  next();
};

const requireRole = authorize;

/**
 * Resource-level authorization middleware for bus management operations:
 * - ADMIN: unrestricted access to all buses
 * - MANAGER: only allowed if bus is assigned to the manager (buses.manager_id = req.user.id)
 * - DRIVER: only allowed if bus is assigned to the driver (buses.driver_id = req.user.id)
 */
const authorizeBusOwnership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole === ROLES.ADMIN) {
    return next(); // Admin has unrestricted operational access
  }

  const busId = req.params.id || req.params.busId || req.body?.bus_id;
  if (!busId) {
    return next();
  }

  const bus = db.prepare('SELECT bus_id, bus_number, manager_id, driver_id FROM buses WHERE bus_id = ?').get(busId);
  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found.' });
  }

  if (userRole === ROLES.MANAGER) {
    if (bus.manager_id !== req.user.id) {
      try {
        req.logActivity?.('UNAUTHORIZED_ACCESS_ATTEMPT', `Manager #${req.user.id} attempted to access unassigned bus ${bus.bus_number} (ID: ${bus.bus_id})`);
      } catch (_) {}
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this bus. You are only authorized to manage your assigned buses.'
      });
    }
  } else if (userRole === ROLES.DRIVER) {
    if (bus.driver_id !== req.user.id) {
      try {
        req.logActivity?.('UNAUTHORIZED_ACCESS_ATTEMPT', `Driver #${req.user.id} attempted to operate unassigned bus ${bus.bus_number} (ID: ${bus.bus_id})`);
      } catch (_) {}
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this bus.'
      });
    }
  } else {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  req.bus = bus;
  next();
};

/**
 * Resource-level authorization middleware for trip operations:
 * - ADMIN: unrestricted access
 * - MANAGER: only allowed if the bus of the trip is assigned to this manager
 * - DRIVER: only allowed if the trip is assigned to this driver
 */
const authorizeTripOwnership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole === ROLES.ADMIN) {
    return next();
  }

  const tripId = req.params.id || req.params.tripId;
  if (!tripId) {
    return next();
  }

  const trip = db.prepare(`
    SELECT t.trip_id, t.bus_id, t.driver_id, t.status, b.bus_number, b.manager_id
    FROM trips t
    JOIN buses b ON b.bus_id = t.bus_id
    WHERE t.trip_id = ?
  `).get(tripId);

  if (!trip) {
    return res.status(404).json({ success: false, message: 'Trip not found.' });
  }

  if (userRole === ROLES.MANAGER) {
    if (trip.manager_id !== req.user.id) {
      try {
        req.logActivity?.('UNAUTHORIZED_ACCESS_ATTEMPT', `Manager #${req.user.id} attempted to modify trip #${trip.trip_id} on unassigned bus ${trip.bus_number}`);
      } catch (_) {}
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage trips for this bus.'
      });
    }
  } else if (userRole === ROLES.DRIVER) {
    if (trip.driver_id !== req.user.id) {
      try {
        req.logActivity?.('UNAUTHORIZED_ACCESS_ATTEMPT', `Driver #${req.user.id} attempted to modify trip #${trip.trip_id} assigned to another driver`);
      } catch (_) {}
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this trip.'
      });
    }
  } else {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  req.trip = trip;
  next();
};

/**
 * Log activity middleware (attaches logger to req)
 */
const activityLogger = (database) => (req, res, next) => {
  const activeDb = database || db;
  req.logActivity = (action, details = '') => {
    try {
      activeDb.prepare(`
        INSERT INTO activity_logs (user_type, user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user?.role?.toLowerCase() || 'anonymous',
        req.user?.id || null,
        action,
        details,
        req.ip || req.connection?.remoteAddress || 'unknown'
      );
    } catch (_) {
      // Non-critical, do not throw
    }
  };
  next();
};

module.exports = {
  authenticate,
  authorize,
  requireRole,
  authorizeBusOwnership,
  authorizeTripOwnership,
  activityLogger
};
