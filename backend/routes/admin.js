const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const {
  getAllDrivers, getDriver, createDriver, updateDriver, deleteDriver, toggleDriverActive
} = require('../controllers/driverController');
const { getAllManagers, getManager, createManager, updateManager, deleteManager } = require('../controllers/managerController');
const { getAllUsers, createUser, deleteUser } = require('../controllers/userManagementController');
const {
  getAllGeofences, getGeofence, createGeofence, updateGeofence, toggleGeofence, deleteGeofence, getViolations
} = require('../controllers/geofenceController');

// ── Unified User Management (Admin only) ──────────────────────────────────────
router.get('/admin/users',            authenticate, authorize(ROLES.ADMIN), getAllUsers);
router.post('/admin/users',           authenticate, authorize(ROLES.ADMIN), createUser);
router.delete('/admin/users/:id',     authenticate, authorize(ROLES.ADMIN), deleteUser);

// ── Driver routes (Admin & Manager) ───────────────────────────────────────────
router.get('/drivers',                authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), getAllDrivers);
router.get('/drivers/:id',            authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), getDriver);
router.post('/drivers',               authenticate, authorize(ROLES.ADMIN), createDriver);
router.put('/drivers/:id',            authenticate, authorize(ROLES.ADMIN), updateDriver);
router.patch('/drivers/:id/toggle',   authenticate, authorize(ROLES.ADMIN), toggleDriverActive);
router.delete('/drivers/:id',         authenticate, authorize(ROLES.ADMIN), deleteDriver);

// ── Manager routes (Admin only) ───────────────────────────────────────────────
router.get('/managers',               authenticate, authorize(ROLES.ADMIN), getAllManagers);
router.get('/managers/:id',           authenticate, authorize(ROLES.ADMIN), getManager);
router.post('/managers',              authenticate, authorize(ROLES.ADMIN), createManager);
router.put('/managers/:id',           authenticate, authorize(ROLES.ADMIN), updateManager);
router.delete('/managers/:id',        authenticate, authorize(ROLES.ADMIN), deleteManager);

// ── Geofence & Operating Area routes ──────────────────────────────────────────
router.get('/geofences',              authenticate, getAllGeofences);
router.get('/geofences/violations',   authenticate, authorize(ROLES.ADMIN), getViolations);
router.get('/geofences/:id',          authenticate, getGeofence);
router.post('/geofences',             authenticate, authorize(ROLES.ADMIN), createGeofence);
router.put('/geofences/:id',          authenticate, authorize(ROLES.ADMIN), updateGeofence);
router.patch('/geofences/:id/toggle', authenticate, authorize(ROLES.ADMIN), toggleGeofence);
router.delete('/geofences/:id',       authenticate, authorize(ROLES.ADMIN), deleteGeofence);

module.exports = router;

