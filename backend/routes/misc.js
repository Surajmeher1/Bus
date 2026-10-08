const express = require('express');
const router = express.Router();
const { authenticate, authorize, authorizeBusOwnership } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { getNotifications, getAllNotifications, createNotification, deleteNotification } = require('../controllers/notificationController');
const { getAllFeedback, getFeedbackByBus, getMyFeedback, submitFeedback } = require('../controllers/feedbackController');
const { getDashboardStats, getReports, changeAdminPassword, getActivityLogs } = require('../controllers/adminController');

// Notification routes
router.get('/notifications/all',       authenticate, authorize(ROLES.ADMIN), getAllNotifications);
router.get('/notifications',           authenticate, getNotifications);
router.post('/notifications',          authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), createNotification);
router.delete('/notifications/:id',    authenticate, authorize(ROLES.ADMIN), deleteNotification);

// Feedback routes
router.get('/feedback',                authenticate, authorize(ROLES.ADMIN), getAllFeedback);
router.get('/feedback/my',             authenticate, authorize(ROLES.STUDENT), getMyFeedback);
router.get('/feedback/bus/:busId',     authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), authorizeBusOwnership, getFeedbackByBus);
router.post('/feedback',               authenticate, authorize(ROLES.STUDENT), submitFeedback);

// Admin stats, reports & security audit logs (Admin strictly restricted)
router.get('/stats',                   authenticate, authorize(ROLES.ADMIN), getDashboardStats);
router.get('/reports',                 authenticate, authorize(ROLES.ADMIN), getReports);
router.put('/admin/change-password',   authenticate, authorize(ROLES.ADMIN), changeAdminPassword);
router.get('/activity-logs',           authenticate, authorize(ROLES.ADMIN), getActivityLogs);

// Public App Configuration (Configurable Android release URL & metadata)
router.get('/config/app', (req, res) => {
  const rawUrl = process.env.ANDROID_APP_URL ? process.env.ANDROID_APP_URL.trim() : '';
  const isAvailable = !!(rawUrl && rawUrl !== 'coming-soon' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')));
  res.json({
    success: true,
    android_app_url: isAvailable ? rawUrl : null,
    is_available: isAvailable,
    app_name: 'GIET Smart Bus Tracker',
    package_name: 'edu.giet.smartbus',
    version: '1.0.0'
  });
});

module.exports = router;

