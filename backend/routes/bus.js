const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAllBuses, getBus, getManagerBuses, createBus, updateBus, deleteBus,
  updateBusLocation, updateBusStatus, updateSeatAvailability, getAllLocations,
  getFuelRecords, addFuelRecord, getMaintenanceRecords, addMaintenanceRecord
} = require('../controllers/busController');

// Public (authenticated any role)
router.get('/locations',             authenticate, getAllLocations);
router.get('/',                      authenticate, getAllBuses);
router.get('/my-buses',              authenticate, requireRole('manager'), getManagerBuses);
router.get('/:id',                   authenticate, getBus);

// Manager/Admin operations
router.put('/:id/location',          authenticate, requireRole('manager', 'admin'), updateBusLocation);
router.put('/:id/status',            authenticate, requireRole('manager', 'admin'), updateBusStatus);
router.put('/:id/seats',             authenticate, requireRole('manager', 'admin'), updateSeatAvailability);
router.get('/:id/fuel',              authenticate, requireRole('manager', 'admin'), getFuelRecords);
router.post('/:id/fuel',             authenticate, requireRole('manager', 'admin'), addFuelRecord);
router.get('/:id/maintenance',       authenticate, requireRole('manager', 'admin'), getMaintenanceRecords);
router.post('/:id/maintenance',      authenticate, requireRole('manager', 'admin'), addMaintenanceRecord);

// Admin only
router.post('/',                     authenticate, requireRole('admin'), createBus);
router.put('/:id',                   authenticate, requireRole('admin'), updateBus);
router.delete('/:id',                authenticate, requireRole('admin'), deleteBus);

module.exports = router;
