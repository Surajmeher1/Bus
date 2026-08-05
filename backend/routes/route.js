const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { getAllRoutes, getRoute, createRoute, updateRoute, deleteRoute, addStop, deleteStop } = require('../controllers/routeController');

router.get('/',              authenticate, getAllRoutes);
router.get('/:id',           authenticate, getRoute);
router.post('/',             authenticate, requireRole('admin'), createRoute);
router.put('/:id',           authenticate, requireRole('admin'), updateRoute);
router.delete('/:id',        authenticate, requireRole('admin'), deleteRoute);
router.post('/:id/stops',    authenticate, requireRole('admin'), addStop);
router.delete('/:id/stops/:stopId', authenticate, requireRole('admin'), deleteStop);

module.exports = router;
