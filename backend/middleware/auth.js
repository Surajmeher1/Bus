const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

/**
 * Verify JWT token and attach decoded payload to req.user
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
    req.user = decoded; // { id, role, email/username }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * Role-based access control middleware factory
 * Usage: requireRole('admin') or requireRole('admin', 'manager')
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role(s): ${roles.join(', ')}.`
    });
  }
  next();
};

/**
 * Log activity middleware (attaches logger to req)
 */
const activityLogger = (db) => (req, res, next) => {
  req.logActivity = (action, details = '') => {
    try {
      db.prepare(`
        INSERT INTO activity_logs (user_type, user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user?.role || 'anonymous',
        req.user?.id || null,
        action,
        details,
        req.ip || req.connection?.remoteAddress || 'unknown'
      );
    } catch (e) {
      // Non-critical, don't throw
    }
  };
  next();
};

module.exports = { authenticate, requireRole, activityLogger };
