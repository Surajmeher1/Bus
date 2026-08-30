/**
 * Driver Routes — Review 1
 * Mounts at /api/v1/driver
 */
const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getMyBus, startTrip, endTrip,
  getPickupPoints, addPickupPoint, deletePickupPoint
} = require('../controllers/driverController');

// ── Driver self-service (driver role only) ────────────────────────────────────
router.get('/my-bus',            authenticate, requireRole('driver'), getMyBus);
router.post('/start-trip',       authenticate, requireRole('driver'), startTrip);
router.post('/end-trip',         authenticate, requireRole('driver'), endTrip);

// ── Pickup points: read accessible to all roles, write to driver/admin only ───
router.get('/pickup-points',     authenticate, getPickupPoints);
router.post('/pickup-points',    authenticate, requireRole('driver', 'admin'), addPickupPoint);
router.delete('/pickup-points/:id', authenticate, requireRole('driver', 'admin'), deletePickupPoint);

module.exports = router;
