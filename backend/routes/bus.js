const express = require('express');
const router = express.Router();
const { authenticate, authorize, authorizeBusOwnership } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const {
  getAllBuses, getBus, getManagerBuses, createBus, updateBus, deleteBus,
  updateBusLocation, updateBusStatus, updateSeatAvailability, getAllLocations,
  getFuelRecords, addFuelRecord, getMaintenanceRecords, addMaintenanceRecord
} = require('../controllers/busController');

// Authenticated (any valid role can view bus locations and list)
router.get('/locations',             authenticate, getAllLocations);
router.get('/',                      authenticate, getAllBuses);
router.get('/my-buses',              authenticate, authorize(ROLES.MANAGER), getManagerBuses);
router.get('/:id',                   authenticate, getBus);

// Manager/Admin operations (Managers restricted to their assigned buses)
router.put('/:id/location',          authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, updateBusLocation);
router.put('/:id/status',            authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, updateBusStatus);
router.put('/:id/seats',             authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, updateSeatAvailability);
router.get('/:id/fuel',              authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, getFuelRecords);
router.post('/:id/fuel',             authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, addFuelRecord);
router.get('/:id/maintenance',       authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, getMaintenanceRecords);
router.post('/:id/maintenance',      authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, addMaintenanceRecord);

// Admin only (Fleet management)
router.post('/',                     authenticate, authorize(ROLES.ADMIN), createBus);
router.put('/:id',                   authenticate, authorize(ROLES.ADMIN), updateBus);
router.delete('/:id',                authenticate, authorize(ROLES.ADMIN), deleteBus);

module.exports = router;

