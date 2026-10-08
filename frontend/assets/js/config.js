/**
 * Smart Bus Tracker — Production Environment & Runtime Configuration
 * 
 * Instructions:
 * - Fullstack Deployment (Frontend & Backend hosted together on Render, Railway, etc.):
 *   Leave API_BASE and SOCKET_URL empty (''). The application automatically detects
 *   window.location.origin (e.g. https://your-app.onrender.com) for all API and Socket.IO calls.
 * 
 * - Separate Static Hosting (Frontend on Vercel/Netlify/GitHub Pages, Backend on Render):
 *   Set API_BASE to 'https://your-backend-api.onrender.com/api/v1'
 *   Set SOCKET_URL to 'https://your-backend-api.onrender.com'
 * 
 * - Local Development:
 *   Leave empty (''). Automatically falls back to http://localhost:5000.
 */

window.__APP_CONFIG__ = Object.assign(
  {
    API_BASE: '',   // Empty = auto-detect from origin; or 'https://your-backend.onrender.com/api/v1'
    SOCKET_URL: '', // Empty = auto-detect from origin; or 'https://your-backend.onrender.com'
    APP_NAME: 'Smart University Bus Tracking System',
    VERSION: '2.0.0'
  },
  window.__APP_CONFIG__ || {}
);
