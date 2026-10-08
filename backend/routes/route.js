const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const {
  getAllRoutes, getRoute, createRoute, updateRoute, deleteRoute,
  addStop, updateStop, deleteStop, reorderStops, assignRoute
} = require('../controllers/routeController');

// Route information (authenticated read)
router.get('/',                         authenticate, getAllRoutes);
router.get('/:id',                      authenticate, getRoute);

// Admin-only Route & Stops configuration
router.post('/',                        authenticate, authorize(ROLES.ADMIN), createRoute);
router.put('/:id',                      authenticate, authorize(ROLES.ADMIN), updateRoute);
router.delete('/:id',                   authenticate, authorize(ROLES.ADMIN), deleteRoute);

// Stops management (Admin only)
router.post('/:id/stops',               authenticate, authorize(ROLES.ADMIN), addStop);
router.put('/:id/stops/reorder',        authenticate, authorize(ROLES.ADMIN), reorderStops);
router.put('/:id/stops/:stopId',        authenticate, authorize(ROLES.ADMIN), updateStop);
router.delete('/:id/stops/:stopId',     authenticate, authorize(ROLES.ADMIN), deleteStop);

// Route assignment to bus/driver (Admin only)
router.post('/:id/assign',              authenticate, authorize(ROLES.ADMIN), assignRoute);

module.exports = router;

