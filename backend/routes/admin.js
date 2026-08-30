const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAllDrivers, getDriver, createDriver, updateDriver, deleteDriver, toggleDriverActive
} = require('../controllers/driverController');
const { getAllManagers, getManager, createManager, updateManager, deleteManager } = require('../controllers/managerController');

// ── Driver routes (Admin only for management) ─────────────────────────────────
router.get('/drivers',               authenticate, requireRole('admin', 'manager'), getAllDrivers);
router.get('/drivers/:id',           authenticate, requireRole('admin', 'manager'), getDriver);
router.post('/drivers',              authenticate, requireRole('admin'), createDriver);
router.put('/drivers/:id',           authenticate, requireRole('admin'), updateDriver);
router.patch('/drivers/:id/toggle',  authenticate, requireRole('admin'), toggleDriverActive);
router.delete('/drivers/:id',        authenticate, requireRole('admin'), deleteDriver);

// ── Manager routes ────────────────────────────────────────────────────────────
router.get('/managers',              authenticate, requireRole('admin'), getAllManagers);
router.get('/managers/:id',          authenticate, requireRole('admin'), getManager);
router.post('/managers',             authenticate, requireRole('admin'), createManager);
router.put('/managers/:id',          authenticate, requireRole('admin'), updateManager);
router.delete('/managers/:id',       authenticate, requireRole('admin'), deleteManager);

module.exports = router;
