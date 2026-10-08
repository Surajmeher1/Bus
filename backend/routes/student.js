const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const {
  getAllStudents, getStudent, getProfile, createStudent,
  updateStudent, deleteStudent, changePassword, setFavoriteBus, searchStudents
} = require('../controllers/studentController');

// Student self-service (STUDENT only)
router.get('/profile',          authenticate, authorize(ROLES.STUDENT), getProfile);
router.put('/profile',          authenticate, authorize(ROLES.STUDENT), updateStudent);
router.put('/change-password',  authenticate, authorize(ROLES.STUDENT), changePassword);
router.put('/favorite-bus',     authenticate, authorize(ROLES.STUDENT), setFavoriteBus);

// Administrative endpoints (ADMIN, MANAGER view)
router.get('/search',           authenticate, authorize(ROLES.ADMIN), searchStudents);
router.get('/',                 authenticate, authorize(ROLES.ADMIN), getAllStudents);
router.get('/:id',              authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), getStudent);
router.post('/',                authenticate, authorize(ROLES.ADMIN), createStudent);
router.put('/:id',              authenticate, authorize(ROLES.ADMIN), updateStudent);
router.delete('/:id',           authenticate, authorize(ROLES.ADMIN), deleteStudent);

module.exports = router;

