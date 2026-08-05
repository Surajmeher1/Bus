/**
 * Smart Bus Tracker — API Client
 * Centralized fetch wrapper with JWT injection, error handling & auth redirect
 */

const API_BASE = 'http://localhost:5000/api/v1';

// ── Token Management ─────────────────────────────────────────────────────────
const Auth = {
  getToken:  ()      => localStorage.getItem('sbt_token'),
  getUser:   ()      => JSON.parse(localStorage.getItem('sbt_user') || 'null'),
  setAuth:   (token, user) => {
    localStorage.setItem('sbt_token', token);
    localStorage.setItem('sbt_user', JSON.stringify(user));
  },
  clearAuth: () => {
    localStorage.removeItem('sbt_token');
    localStorage.removeItem('sbt_user');
  },
  isLoggedIn: () => !!localStorage.getItem('sbt_token'),
  getRole:    () => {
    const user = JSON.parse(localStorage.getItem('sbt_user') || 'null');
    return user?.role || null;
  },
  redirectIfNotRole: (role) => {
    const user = JSON.parse(localStorage.getItem('sbt_user') || 'null');
    if (!user || user.role !== role) {
      window.location.href = '/index.html';
    }
  },
  logout: () => {
    Auth.clearAuth();
    window.location.href = '/index.html';
  }
};

// ── HTTP Client ──────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    // Token expired → logout
    if (response.status === 401) {
      Auth.clearAuth();
      window.location.href = '/index.html';
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Cannot connect to server. Please ensure the backend is running.');
    }
    throw err;
  }
}

// ── Convenience Methods ───────────────────────────────────────────────────────
const API = {
  get:    (url)          => apiFetch(url, { method: 'GET' }),
  post:   (url, body)    => apiFetch(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (url, body)    => apiFetch(url, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (url)          => apiFetch(url, { method: 'DELETE' }),
};

// ── Auth Endpoints ────────────────────────────────────────────────────────────
const AuthAPI = {
  studentLogin:   (data) => API.post('/auth/student/login', data),
  studentRegister:(data) => API.post('/auth/student/register', data),
  managerLogin:   (data) => API.post('/auth/manager/login', data),
  adminLogin:     (data) => API.post('/auth/admin/login', data),
};

// ── Bus Endpoints ─────────────────────────────────────────────────────────────
const BusAPI = {
  getAll:       ()         => API.get('/buses'),
  getOne:       (id)       => API.get(`/buses/${id}`),
  getLocations: ()         => API.get('/buses/locations'),
  getMyBuses:   ()         => API.get('/buses/my-buses'),
  create:       (data)     => API.post('/buses', data),
  update:       (id, data) => API.put(`/buses/${id}`, data),
  delete:       (id)       => API.delete(`/buses/${id}`),
  updateLocation:(id, data)=> API.put(`/buses/${id}/location`, data),
  updateStatus:  (id, data)=> API.put(`/buses/${id}/status`, data),
  updateSeats:   (id, data)=> API.put(`/buses/${id}/seats`, data),
  getFuel:       (id)      => API.get(`/buses/${id}/fuel`),
  addFuel:       (id, data)=> API.post(`/buses/${id}/fuel`, data),
  getMaintenance:(id)      => API.get(`/buses/${id}/maintenance`),
  addMaintenance:(id, data)=> API.post(`/buses/${id}/maintenance`, data),
};

// ── Route Endpoints ───────────────────────────────────────────────────────────
const RouteAPI = {
  getAll:    ()         => API.get('/routes'),
  getOne:    (id)       => API.get(`/routes/${id}`),
  create:    (data)     => API.post('/routes', data),
  update:    (id, data) => API.put(`/routes/${id}`, data),
  delete:    (id)       => API.delete(`/routes/${id}`),
};

// ── Trip Endpoints ────────────────────────────────────────────────────────────
const TripAPI = {
  getToday:  ()         => API.get('/trips/today'),
  getAll:    ()         => API.get('/trips'),
  start:     (data)     => API.post('/trips/start', data),
  end:       (id)       => API.put(`/trips/${id}/end`),
  getHistory:(busId)    => API.get(`/trips/bus/${busId}/history`),
};

// ── Student Endpoints ──────────────────────────────────────────────────────────
const StudentAPI = {
  getProfile:  ()         => API.get('/students/profile'),
  updateProfile:(data)    => API.put('/students/profile', data),
  changePassword:(data)   => API.put('/students/change-password', data),
  setFavorite: (data)     => API.put('/students/favorite-bus', data),
  getAll:      ()         => API.get('/students'),
  create:      (data)     => API.post('/students', data),
  update:      (id, data) => API.put(`/students/${id}`, data),
  delete:      (id)       => API.delete(`/students/${id}`),
  search:      (q)        => API.get(`/students/search?q=${encodeURIComponent(q)}`),
};

// ── Driver Endpoints ───────────────────────────────────────────────────────────
const DriverAPI = {
  getAll:   ()         => API.get('/drivers'),
  getOne:   (id)       => API.get(`/drivers/${id}`),
  create:   (data)     => API.post('/drivers', data),
  update:   (id, data) => API.put(`/drivers/${id}`, data),
  delete:   (id)       => API.delete(`/drivers/${id}`),
};

// ── Manager Endpoints ──────────────────────────────────────────────────────────
const ManagerAPI = {
  getAll:   ()         => API.get('/managers'),
  create:   (data)     => API.post('/managers', data),
  update:   (id, data) => API.put(`/managers/${id}`, data),
  delete:   (id)       => API.delete(`/managers/${id}`),
};

// ── Notification Endpoints ─────────────────────────────────────────────────────
const NotifAPI = {
  getAll:  ()      => API.get('/notifications'),
  create:  (data)  => API.post('/notifications', data),
  delete:  (id)    => API.delete(`/notifications/${id}`),
};

// ── Feedback Endpoints ─────────────────────────────────────────────────────────
const FeedbackAPI = {
  submit:    (data)   => API.post('/feedback', data),
  getMy:     ()       => API.get('/feedback/my'),
  getByBus:  (busId)  => API.get(`/feedback/bus/${busId}`),
  getAll:    ()       => API.get('/feedback'),
};

// ── Admin Endpoints ────────────────────────────────────────────────────────────
const AdminAPI = {
  getStats:   ()     => API.get('/stats'),
  getReports: ()     => API.get('/reports'),
  getLogs:    ()     => API.get('/activity-logs'),
};

// ── Toast Notifications ────────────────────────────────────────────────────────
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type]} toast-icon" style="color:${colors[type]}"></i>
      <div class="toast-message">${message}</div>
    `;
    this.container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
  info:    (msg) => Toast.show(msg, 'info'),
};

// ── Theme Manager ─────────────────────────────────────────────────────────────
const Theme = {
  get: ()    => localStorage.getItem('sbt_theme') || 'light',
  set: (t)   => { localStorage.setItem('sbt_theme', t); document.documentElement.setAttribute('data-theme', t); },
  toggle: () => { const next = Theme.get() === 'dark' ? 'light' : 'dark'; Theme.set(next); return next; },
  init: ()   => { Theme.set(Theme.get()); }
};

// ── Sidebar Manager ────────────────────────────────────────────────────────────
const Sidebar = {
  toggle() {
    const sidebar = document.querySelector('.sidebar');
    const main    = document.querySelector('.main-content');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    main?.classList.toggle('expanded');
    localStorage.setItem('sbt_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'open');
  },
  init() {
    const sidebar = document.querySelector('.sidebar');
    const main    = document.querySelector('.main-content');
    if (!sidebar) return;
    const state = localStorage.getItem('sbt_sidebar');
    if (state === 'collapsed') { sidebar.classList.add('collapsed'); main?.classList.add('expanded'); }
    document.querySelector('.sidebar-toggle-btn')?.addEventListener('click', () => Sidebar.toggle());
  }
};

// ── User Menu ──────────────────────────────────────────────────────────────────
const UserMenu = {
  init() {
    const avatar = document.getElementById('user-avatar');
    const menu   = document.getElementById('user-menu');
    if (!avatar || !menu) return;
    avatar.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', () => menu.classList.remove('open'));
  }
};

// ── Active Nav ─────────────────────────────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname + window.location.search;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (path.includes(href) || (href !== '/' && path.endsWith(href)))) {
      link.classList.add('active');
    }
  });
}

// ── Initialize on DOM Ready ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Toast.init();
  Sidebar.init();
  UserMenu.init();
  setActiveNav();

  // Theme toggle button
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = Theme.toggle();
    const btn = document.getElementById('theme-toggle');
    btn.innerHTML = next === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  });
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.innerHTML = Theme.get() === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  }

  // Populate user info in topbar
  const user = Auth.getUser();
  if (user) {
    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = (user.name || user.username || 'U').charAt(0).toUpperCase();
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = user.name || user.username || 'User';
    const roleEl = document.getElementById('user-display-role');
    if (roleEl) roleEl.textContent = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
  }

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', Auth.logout);
});
