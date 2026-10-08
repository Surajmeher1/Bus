const express = require('express');
const router = express.Router();
const { authenticate, authorize, authorizeBusOwnership, authorizeTripOwnership } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { getAllTrips, getTodayTrips, startTrip, endTrip, getTripHistory } = require('../controllers/tripController');

// Read trips (authenticated)
router.get('/today',                 authenticate, getTodayTrips);
router.get('/',                      authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), getAllTrips);
router.get('/bus/:busId/history',    authenticate, getTripHistory);

// Operational trip management (Admin unrestricted, Manager restricted to assigned buses/trips)
router.post('/start',                authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, startTrip);
router.put('/:id/end',               authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeTripOwnership, endTrip);

module.exports = router;

