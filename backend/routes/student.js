const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAllStudents, getStudent, getProfile, createStudent,
  updateStudent, deleteStudent, changePassword, setFavoriteBus, searchStudents
} = require('../controllers/studentController');

// Student self-service
router.get('/profile',          authenticate, requireRole('student'), getProfile);
router.put('/profile',          authenticate, requireRole('student'), updateStudent);
router.put('/change-password',  authenticate, requireRole('student'), changePassword);
router.put('/favorite-bus',     authenticate, requireRole('student'), setFavoriteBus);

// Admin endpoints
router.get('/search',           authenticate, requireRole('admin'), searchStudents);
router.get('/',                 authenticate, requireRole('admin'), getAllStudents);
router.get('/:id',              authenticate, requireRole('admin', 'manager'), getStudent);
router.post('/',                authenticate, requireRole('admin'), createStudent);
router.put('/:id',              authenticate, requireRole('admin'), updateStudent);
router.delete('/:id',           authenticate, requireRole('admin'), deleteStudent);

module.exports = router;
