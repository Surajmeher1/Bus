const express = require('express');
const router = express.Router();
const { adminLogin, driverLogin, managerLogin, studentRegister, studentLogin, unifiedLogin, getMe } = require('../controllers/authController');
const { changeTempPassword } = require('../controllers/userManagementController');
const { authenticate } = require('../middleware/auth');

// Unified RBAC login (auto-detects role across Admin, Manager, Driver, Student)
router.post('/login',                      unifiedLogin);

// Role-specific login endpoints (preserved for existing integrations)
router.post('/admin/login',                adminLogin);
router.post('/driver/login',               driverLogin);
router.post('/manager/login',              managerLogin);
router.post('/student/register',           studentRegister);
router.post('/student/login',              studentLogin);
router.get('/me',                          authenticate, getMe);
router.post('/change-temp-password',       authenticate, changeTempPassword);

module.exports = router;
