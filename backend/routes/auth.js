const express = require('express');
const router = express.Router();
const { adminLogin, driverLogin, managerLogin, studentRegister, studentLogin, getMe } = require('../controllers/authController');
const { changeTempPassword } = require('../controllers/userManagementController');
const { authenticate } = require('../middleware/auth');

router.post('/admin/login',              adminLogin);
router.post('/driver/login',             driverLogin);
router.post('/manager/login',            managerLogin);
router.post('/student/register',         studentRegister);
router.post('/student/login',            studentLogin);
router.get('/me',                        authenticate, getMe);
router.post('/change-temp-password',     authenticate, changeTempPassword);

module.exports = router;
