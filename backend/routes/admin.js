const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAllDrivers, getDriver, createDriver, updateDriver, deleteDriver, toggleDriverActive
} = require('../controllers/driverController');
const { getAllManagers, getManager, createManager, updateManager, deleteManager } = require('../controllers/managerController');
const { getAllUsers, createUser, deleteUser } = require('../controllers/userManagementController');
const {
  getAllGeofences, getGeofence, createGeofence, updateGeofence, toggleGeofence, deleteGeofence, getViolations
} = require('../controllers/geofenceController');

// ── Unified User Management (Admin only) ──────────────────────────────────────
router.get('/admin/users',            authenticate, requireRole('admin'), getAllUsers);
router.post('/admin/users', (req, res, next) => {
  console.log('[USER CREATE] route reached');
  next();
}, authenticate, (req, res, next) => {
  console.log('[USER CREATE] authenticated user:', req.user?.username || req.user?.role || req.user?.id);
  next();
}, requireRole('admin'), createUser);
router.delete('/admin/users/:id',     authenticate, requireRole('admin'), deleteUser);

// ── Driver routes (Admin & Manager) ───────────────────────────────────────────
router.get('/drivers',                authenticate, requireRole('admin', 'manager'), getAllDrivers);
router.get('/drivers/:id',            authenticate, requireRole('admin', 'manager'), getDriver);
router.post('/drivers',               authenticate, requireRole('admin'), createDriver);
router.put('/drivers/:id',            authenticate, requireRole('admin'), updateDriver);
router.patch('/drivers/:id/toggle',   authenticate, requireRole('admin'), toggleDriverActive);
router.delete('/drivers/:id',         authenticate, requireRole('admin'), deleteDriver);

// ── Manager routes ────────────────────────────────────────────────────────────
router.get('/managers',               authenticate, requireRole('admin'), getAllManagers);
router.get('/managers/:id',           authenticate, requireRole('admin'), getManager);
router.post('/managers',              authenticate, requireRole('admin'), createManager);
router.put('/managers/:id',           authenticate, requireRole('admin'), updateManager);
router.delete('/managers/:id',        authenticate, requireRole('admin'), deleteManager);

// ── Geofence & Operating Area routes ──────────────────────────────────────────
router.get('/geofences',              authenticate, getAllGeofences);
router.get('/geofences/violations',   authenticate, requireRole('admin'), getViolations);
router.get('/geofences/:id',          authenticate, getGeofence);
router.post('/geofences',             authenticate, requireRole('admin'), createGeofence);
router.put('/geofences/:id',          authenticate, requireRole('admin'), updateGeofence);
router.patch('/geofences/:id/toggle', authenticate, requireRole('admin'), toggleGeofence);
router.delete('/geofences/:id',       authenticate, requireRole('admin'), deleteGeofence);

module.exports = router;
