const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { getNotifications, getAllNotifications, createNotification, deleteNotification } = require('../controllers/notificationController');
const { getAllFeedback, getFeedbackByBus, getMyFeedback, submitFeedback } = require('../controllers/feedbackController');
const { getDashboardStats, getReports, changeAdminPassword, getActivityLogs } = require('../controllers/adminController');

// Notification routes
router.get('/notifications/all',       authenticate, requireRole('admin'), getAllNotifications);
router.get('/notifications',           authenticate, getNotifications);
router.post('/notifications',          authenticate, requireRole('admin', 'manager'), createNotification);
router.delete('/notifications/:id',    authenticate, requireRole('admin'), deleteNotification);

// Feedback routes
router.get('/feedback',                authenticate, requireRole('admin'), getAllFeedback);
router.get('/feedback/my',             authenticate, requireRole('student'), getMyFeedback);
router.get('/feedback/bus/:busId',     authenticate, requireRole('manager', 'admin'), getFeedbackByBus);
router.post('/feedback',               authenticate, requireRole('student'), submitFeedback);

// Admin stats & reports
router.get('/stats',                   authenticate, requireRole('admin'), getDashboardStats);
router.get('/reports',                 authenticate, requireRole('admin'), getReports);
router.put('/admin/change-password',   authenticate, requireRole('admin'), changeAdminPassword);
router.get('/activity-logs',           authenticate, requireRole('admin'), getActivityLogs);

module.exports = router;
