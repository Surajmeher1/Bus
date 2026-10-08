/**
 * Driver Routes — RBAC Controlled
 * Mounts at /api/v1/driver
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const {
  getMyBus, startTrip, endTrip,
  getPickupPoints, addPickupPoint, deletePickupPoint
} = require('../controllers/driverController');

// ── Driver self-service (DRIVER role only) ────────────────────────────────────
router.get('/my-bus',            authenticate, authorize(ROLES.DRIVER), getMyBus);
router.post('/start-trip',       authenticate, authorize(ROLES.DRIVER), startTrip);
router.post('/end-trip',         authenticate, authorize(ROLES.DRIVER), endTrip);

// ── Pickup points: read accessible to all roles, write to DRIVER/ADMIN only ───
router.get('/pickup-points',     authenticate, getPickupPoints);
router.post('/pickup-points',    authenticate, authorize(ROLES.DRIVER, ROLES.ADMIN), addPickupPoint);
router.delete('/pickup-points/:id', authenticate, authorize(ROLES.DRIVER, ROLES.ADMIN), deletePickupPoint);

module.exports = router;

