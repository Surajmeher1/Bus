/**
 * Smart Bus Tracker — API Client
 * Centralized fetch wrapper with JWT injection, error handling & auth redirect
 */

const API_BASE = 'http://localhost:5000/api/v1';

// ── RBAC Role Definitions & Portal Mappings ───────────────────────────────────
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  DRIVER: 'DRIVER',
  STUDENT: 'STUDENT'
});

const ROLE_DASHBOARDS = Object.freeze({
  ADMIN: '/pages/admin/dashboard.html',
  MANAGER: '/pages/manager/dashboard.html',
  DRIVER: '/pages/driver/dashboard.html',
  STUDENT: '/pages/student/dashboard.html'
});

function normalizeRole(role) {
  if (!role || typeof role !== 'string') return '';
  return role.trim().toUpperCase();
}

// ── Token Management ─────────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('sbt_token'),
  getUser:  () => {
    try {
      const u = JSON.parse(localStorage.getItem('sbt_user') || 'null');
      if (u && u.role) {
        u.role = normalizeRole(u.role);
      }
      return u;
    } catch (_) {
      return null;
    }
  },
  setAuth: (token, user) => {
    localStorage.setItem('sbt_token', token);
    const normalizedUser = user ? { ...user, role: normalizeRole(user.role) } : null;
    localStorage.setItem('sbt_user', JSON.stringify(normalizedUser));
  },
  clearAuth: () => {
    localStorage.removeItem('sbt_token');
    localStorage.removeItem('sbt_user');
  },
  isLoggedIn: () => !!localStorage.getItem('sbt_token'),
  getRole: () => {
    const user = Auth.getUser();
    return user?.role ? normalizeRole(user.role) : null;
  },
  hasRole: (requiredRole) => {
    const userRole = Auth.getRole();
    return userRole === normalizeRole(requiredRole);
  },
  redirectAfterLogin: (user) => {
    const role = normalizeRole(user?.role || Auth.getRole());
    const target = ROLE_DASHBOARDS[role] || '/index.html';
    window.location.href = target;
  },
  redirectIfNotRole: (requiredRole) => {
    const user = Auth.getUser();
    const token = Auth.getToken();
    if (!token || !user) {
      Auth.clearAuth();
      window.location.href = '/index.html';
      return;
    }
    const currentRole = normalizeRole(user.role);
    const targetRole = normalizeRole(requiredRole);
    if (currentRole !== targetRole) {
      console.warn(`[RBAC] Access denied for role '${currentRole}'. Required: '${targetRole}'. Redirecting...`);
      const fallbackUrl = ROLE_DASHBOARDS[currentRole] || '/index.html';
      window.location.href = fallbackUrl;
    }
  },
  checkAlreadyLoggedInAndRedirect: () => {
    if (Auth.isLoggedIn()) {
      const role = Auth.getRole();
      if (role && ROLE_DASHBOARDS[role]) {
        window.location.href = ROLE_DASHBOARDS[role];
      }
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

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      const err = new Error(data.message || `Request failed (${response.status})`);
      err.status = response.status;
      err.data = data;
      if (response.status === 401) {
        Auth.clearAuth();
        setTimeout(() => { window.location.href = '/index.html'; }, 2000);
      }
      throw err;
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
  patch:  (url, body)    => apiFetch(url, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (url)          => apiFetch(url, { method: 'DELETE' }),
};

// ── Auth Endpoints ────────────────────────────────────────────────────────────
const AuthAPI = {
  studentLogin:      (data) => API.post('/auth/student/login', data),
  studentRegister:   (data) => API.post('/auth/student/register', data),
  driverLogin:       (data) => API.post('/auth/driver/login', data),
  managerLogin:      (data) => API.post('/auth/manager/login', data),
  adminLogin:        (data) => API.post('/auth/admin/login', data),
  changeTempPassword:(data) => API.post('/auth/change-temp-password', data),
};

// ── Strict GIET Email Validation (Frontend) ──────────────────────────────────
function isValidGietEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@giet\.edu$/i;
  return emailRegex.test(email.trim());
}

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
  getAll:      ()                     => API.get('/routes'),
  getOne:      (id)                   => API.get(`/routes/${id}`),
  create:      (data)                 => API.post('/routes', data),
  update:      (id, data)             => API.put(`/routes/${id}`, data),
  delete:      (id)                   => API.delete(`/routes/${id}`),
  addStop:     (id, data)             => API.post(`/routes/${id}/stops`, data),
  updateStop:  (id, stopId, data)     => API.put(`/routes/${id}/stops/${stopId}`, data),
  deleteStop:  (id, stopId)           => API.delete(`/routes/${id}/stops/${stopId}`),
  reorderStops:(id, stops)            => API.put(`/routes/${id}/stops/reorder`, { stops }),
  assign:      (id, data)             => API.post(`/routes/${id}/assign`, data),
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
  getAll:        ()         => API.get('/drivers'),
  getOne:        (id)       => API.get(`/drivers/${id}`),
  create:        (data)     => API.post('/drivers', data),
  update:        (id, data) => API.put(`/drivers/${id}`, data),
  toggle:        (id)       => API.patch(`/drivers/${id}/toggle`, {}),
  delete:        (id)       => API.delete(`/drivers/${id}`),
  getMyBus:      ()         => API.get('/driver/my-bus'),
  startTrip:     (data)     => API.post('/driver/start-trip', data),
  endTrip:       ()         => API.post('/driver/end-trip', {}),
};

// ── Pickup Point Endpoints ────────────────────────────────────────────────────
const PickupAPI = {
  getAll:   (params = {}) => {
    const q = Object.entries(params).map(([k,v]) => `${k}=${v}`).join('&');
    return API.get(`/driver/pickup-points${q ? '?' + q : ''}`);
  },
  create:   (data)     => API.post('/driver/pickup-points', data),
  delete:   (id)       => API.delete(`/driver/pickup-points/${id}`),
};

// ── Geofence & Operating Area Endpoints ───────────────────────────────────────
const GeofenceAPI = {
  getAll:        ()         => API.get('/geofences'),
  getOne:        (id)       => API.get(`/geofences/${id}`),
  create:        (data)     => API.post('/geofences', data),
  update:        (id, data) => API.put(`/geofences/${id}`, data),
  toggle:        (id)       => API.patch(`/geofences/${id}/toggle`, {}),
  delete:        (id)       => API.delete(`/geofences/${id}`),
  getViolations: ()         => API.get('/geofences/violations'),
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
  getStats:   ()           => API.get('/stats'),
  getReports: ()           => API.get('/reports'),
  getLogs:    ()           => API.get('/activity-logs'),
  getUsers:   (params = {})=> {
    const q = Object.entries(params).map(([k,v]) => `${k}=${v}`).join('&');
    return API.get(`/admin/users${q ? '?' + q : ''}`);
  },
  createUser: (data)       => API.post('/admin/users', data),
  deleteUser: (id)         => API.delete(`/admin/users/${encodeURIComponent(id)}`),
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

  // Check if first-login temporary password change is required
  promptPasswordChangeOnFirstLogin();
});

// ── First-Login Password Change Modal ──────────────────────────────────────────
function promptPasswordChangeOnFirstLogin() {
  const user = Auth.getUser();
  if (!user || !user.must_change_password) return;

  // Don't show on login pages
  if (window.location.pathname.includes('login.html') || window.location.pathname.endsWith('index.html')) return;

  if (document.getElementById('temp-pwd-modal')) return;

  const modalHtml = `
    <div id="temp-pwd-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
      <div style="background:var(--bg-card, #ffffff);border:1px solid var(--border-color, #e2e8f0);border-radius:16px;padding:28px;max-width:440px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,0.3);color:var(--text-primary, #1e293b);">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:52px;height:52px;border-radius:50%;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 12px;">
            <i class="fa-solid fa-key"></i>
          </div>
          <h3 style="margin:0 0 6px;font-size:1.25rem;font-weight:800;">Password Change Required</h3>
          <p style="margin:0;font-size:0.85rem;color:var(--text-secondary, #64748b);">
            You have logged in with a temporary password. For your security, please set a permanent password before continuing.
          </p>
        </div>
        <form id="temp-pwd-form" onsubmit="handleTempPwdSubmit(event)">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:6px;">Current Temporary Password</label>
            <input type="password" id="temp-pwd-current" class="form-control" required style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color, #cbd5e1);background:var(--bg-input, #fff);color:inherit;" placeholder="Enter temporary password" />
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:6px;">New Password (min 6 characters)</label>
            <input type="password" id="temp-pwd-new" class="form-control" minlength="6" required style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color, #cbd5e1);background:var(--bg-input, #fff);color:inherit;" placeholder="Enter new password" />
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:6px;">Confirm New Password</label>
            <input type="password" id="temp-pwd-confirm" class="form-control" minlength="6" required style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color, #cbd5e1);background:var(--bg-input, #fff);color:inherit;" placeholder="Confirm new password" />
          </div>
          <div id="temp-pwd-err" style="color:#ef4444;font-size:0.8rem;margin-bottom:12px;display:none;"></div>
          <button type="submit" id="temp-pwd-btn" class="btn btn-primary" style="width:100%;padding:12px;border-radius:8px;font-weight:700;">
            Update Password & Continue
          </button>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function handleTempPwdSubmit(e) {
  e.preventDefault();
  const current = document.getElementById('temp-pwd-current').value;
  const newPwd  = document.getElementById('temp-pwd-new').value;
  const confirm = document.getElementById('temp-pwd-confirm').value;
  const errEl   = document.getElementById('temp-pwd-err');
  const btn     = document.getElementById('temp-pwd-btn');

  if (newPwd !== confirm) {
    errEl.textContent = 'New passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating...';
  errEl.style.display = 'none';

  try {
    const res = await AuthAPI.changeTempPassword({ current_password: current, new_password: newPwd });
    Toast.success(res.message || 'Password updated successfully!');
    const user = Auth.getUser();
    if (user) {
      user.must_change_password = false;
      localStorage.setItem('sbt_user', JSON.stringify(user));
    }
    const modal = document.getElementById('temp-pwd-modal');
    if (modal) modal.remove();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to update password.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Update Password & Continue';
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    promptPasswordChangeOnFirstLogin();
  });
}

// ── PWA Service Worker Registration ──────────────────────────────────────────
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // Registered successfully
      })
      .catch(err => {
        // Handled silently
      });
  });
}

// ── Native Mobile / Capacitor Environment Detection ──────────────────────────
const NativeApp = {
  isNative: () => typeof window !== 'undefined' && (!!window.Capacitor || !!window.AndroidBridge || navigator.userAgent.includes('SmartBusAndroid')),
  getPlatform: () => {
    if (typeof window !== 'undefined' && window.Capacitor?.getPlatform) {
      return window.Capacitor.getPlatform();
    }
    return /android/i.test(navigator.userAgent) ? 'android' : 'web';
  }
};
if (typeof window !== 'undefined') {
  window.NativeApp = NativeApp;
}

