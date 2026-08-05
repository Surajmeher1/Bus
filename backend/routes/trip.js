const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { getAllTrips, getTodayTrips, startTrip, endTrip, getTripHistory } = require('../controllers/tripController');

router.get('/today',           authenticate, getTodayTrips);
router.get('/',                authenticate, requireRole('admin', 'manager'), getAllTrips);
router.post('/start',          authenticate, requireRole('manager', 'admin'), startTrip);
router.put('/:id/end',         authenticate, requireRole('manager', 'admin'), endTrip);
router.get('/bus/:busId/history', authenticate, getTripHistory);

module.exports = router;
