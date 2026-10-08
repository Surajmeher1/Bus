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

// Helper: Resolve configurable production-safe map tile settings
function getMapConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  let tileUrl = process.env.MAP_TILE_URL ? process.env.MAP_TILE_URL.trim() : '';
  let attribution = process.env.MAP_TILE_ATTRIBUTION ? process.env.MAP_TILE_ATTRIBUTION.trim() : '';
  const subdomains = process.env.MAP_TILE_SUBDOMAINS ? process.env.MAP_TILE_SUBDOMAINS.trim() : 'abcd';
  const maxZoom = parseInt(process.env.MAP_TILE_MAX_ZOOM, 10) || 19;
  const apiKey = process.env.MAP_TILE_API_KEY ? process.env.MAP_TILE_API_KEY.trim() : '';

  if (!tileUrl) {
    // Production-safe high-availability hosted OSM tiles via Humanitarian OpenStreetMap Team (no watermark, no 403)
    tileUrl = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
    attribution = attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>';
  } else {
    // If an API key is specified and placeholder exists, inject safely
    if (apiKey && tileUrl.includes('{apiKey}')) {
      tileUrl = tileUrl.replace('{apiKey}', apiKey);
    }
    if (!attribution) {
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }
  }

  return {
    tile_url: tileUrl,
    attribution,
    subdomains,
    max_zoom: maxZoom,
    is_production: isProduction
  };
}

// Public App Configuration (Configurable Android release URL & map provider metadata)
router.get('/config/app', (req, res) => {
  const rawUrl = process.env.ANDROID_APP_URL ? process.env.ANDROID_APP_URL.trim() : '';
  const isAvailable = !!(rawUrl && rawUrl !== 'coming-soon' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')));
  res.json({
    success: true,
    android_app_url: isAvailable ? rawUrl : null,
    is_available: isAvailable,
    app_name: 'GIET Smart Bus Tracker',
    package_name: 'edu.giet.smartbus',
    version: '1.0.0',
    map: getMapConfig()
  });
});

module.exports = router;

