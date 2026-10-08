const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAllRoutes, getRoute, createRoute, updateRoute, deleteRoute,
  addStop, updateStop, deleteStop, reorderStops, assignRoute
} = require('../controllers/routeController');

router.get('/',                         authenticate, getAllRoutes);
router.get('/:id',                      authenticate, getRoute);
router.post('/',                        authenticate, requireRole('admin'), createRoute);
router.put('/:id',                      authenticate, requireRole('admin'), updateRoute);
router.delete('/:id',                   authenticate, requireRole('admin'), deleteRoute);

// Stops management
router.post('/:id/stops',               authenticate, requireRole('admin'), addStop);
router.put('/:id/stops/reorder',        authenticate, requireRole('admin'), reorderStops);
router.put('/:id/stops/:stopId',        authenticate, requireRole('admin'), updateStop);
router.delete('/:id/stops/:stopId',     authenticate, requireRole('admin'), deleteStop);

// Route assignment to bus/driver
router.post('/:id/assign',              authenticate, requireRole('admin'), assignRoute);

module.exports = router;
