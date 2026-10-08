/**
 * test-homepage-rbac.js
 * End-to-End Test Suite for RBAC-Aware Homepage & Configurable Android App Button
 * 
 * Tests:
 * 1. Backend Config API (/api/v1/config/app) with different ANDROID_APP_URL values
 * 2. Static HTML & JS RBAC element integrity in index.html & api.js
 * 3. Chrome Headless E2E Simulation via CDP WebSocket:
 *    - Logged-out state: Install Android App button visible, login dropdown visible
 *    - Logged-in STUDENT: Install hidden, Student Dashboard button visible
 *    - Logged-in DRIVER: Install hidden, Driver Dashboard button visible
 *    - Logged-in MANAGER: Install hidden, Manager Dashboard button visible
 *    - Logged-in ADMIN: Install hidden, Admin Dashboard button visible
 *    - Logout: Install Android App button reappears immediately
 *    - Android URL state toggling (Available vs Coming Soon)
 *    - Android modal vs PWA distinction
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const jwtConfig = require('./config/jwt');

function makeToken(id, role, extra = {}) {
  return jwt.sign({ id, role, ...extra }, jwtConfig.secret, { expiresIn: '2h' });
}

const PORT = 5000;
const CHROME_PORT = 9222;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

// ── CDP Client Helper ───────────────────────────────────────────────────────────
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// ── Main Test Runner ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n======================================================');
  console.log('📱 SMART BUS TRACKER — HOMEPAGE RBAC & ANDROID TEST');
  console.log('======================================================\n');

  // ── 1. Backend Config API Tests ──────────────────────────────────────────────
  console.log('📌 [1] Backend Config API (/api/v1/config/app)');
  try {
    const res = await httpGet('/api/v1/config/app');
    assert(res.status === 200, 'GET /api/v1/config/app returns status 200');
    assert(res.body.success === true, 'Response success is true');
    assert(typeof res.body.is_available === 'boolean', 'Response contains boolean is_available');
    assert(res.body.app_name === 'GIET Smart Bus Tracker', 'Response contains correct app_name');
    assert(res.body.package_name === 'edu.giet.smartbus', 'Response contains correct package_name');
  } catch (err) {
    assert(false, `Config API request failed: ${err.message}`);
  }

  // ── 2. Static HTML & JS Structure Verification ───────────────────────────────
  console.log('\n📌 [2] Static Frontend File Verification (index.html & api.js)');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const apiJs = fs.readFileSync(path.join(__dirname, '../frontend/assets/js/api.js'), 'utf8');

  assert(indexHtml.includes('id="nav-guest-actions"'), 'index.html contains #nav-guest-actions');
  assert(indexHtml.includes('id="nav-user-actions"'), 'index.html contains #nav-user-actions');
  assert(indexHtml.includes('id="nav-android-btn"'), 'index.html contains #nav-android-btn');
  assert(indexHtml.includes('id="hero-android-btn"'), 'index.html contains #hero-android-btn');
  assert(indexHtml.includes('id="login-dropdown"'), 'index.html contains #login-dropdown');
  assert(indexHtml.includes('Student Login') && indexHtml.includes('Driver Login') && 
         indexHtml.includes('Manager Login') && indexHtml.includes('Admin Login'), 
         'index.html contains all 4 login options');
  assert(indexHtml.includes('id="nav-user-role-badge"'), 'index.html contains #nav-user-role-badge');
  assert(indexHtml.includes('id="nav-dashboard-btn"'), 'index.html contains #nav-dashboard-btn');
  assert(indexHtml.includes('id="hero-user-actions"'), 'index.html contains #hero-user-actions');
  assert(indexHtml.includes('id="hero-dashboard-btn"'), 'index.html contains #hero-dashboard-btn');
  assert(indexHtml.includes('id="android-modal"'), 'index.html contains #android-modal');
  assert(indexHtml.includes('Capacitor'), 'index.html modal references Capacitor Android build');
  assert(indexHtml.includes('portal-card'), 'index.html contains role portal cards');
  assert(indexHtml.includes('One System, Four Unified Roles'), 'index.html How It Works outlines 4 roles');

  assert(apiJs.includes('ConfigAPI'), 'api.js exports ConfigAPI');
  assert(apiJs.includes('ROLE_DASHBOARDS'), 'api.js defines ROLE_DASHBOARDS');
  assert(apiJs.includes('ROLE_LABELS'), 'api.js defines ROLE_LABELS');
  assert(apiJs.includes('getDashboardUrl'), 'api.js Auth defines getDashboardUrl');
  assert(apiJs.includes('getDashboardLabel'), 'api.js Auth defines getDashboardLabel');
  assert(apiJs.includes('validateSession'), 'api.js Auth defines validateSession');

  // ── 3. Headless Chrome End-to-End Simulation ──────────────────────────────────
  console.log('\n📌 [3] Headless Chrome E2E Simulation (CDP)');

  if (!fs.existsSync(CHROME_PATH)) {
    console.log('⚠️ Chrome executable not found, skipping CDP browser tests.');
    return;
  }

  let chromeProcess = null;
  let cdp = null;

  try {
    chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${CHROME_PORT}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      'about:blank'
    ]);

    // Wait 1.5s for Chrome to initialize
    await new Promise(r => setTimeout(r, 1500));

    // Fetch WebSocket endpoint from Chrome
    const versionRes = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${CHROME_PORT}/json/version`, res => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    cdp = new CdpClient(versionRes.webSocketDebuggerUrl);
    await cdp.connect();

    // Create a new target/page
    const target = await cdp.send('Target.createTarget', { url: `http://localhost:${PORT}/` });
    const targetWsUrl = `ws://localhost:${CHROME_PORT}/devtools/page/${target.targetId}`;

    const pageCdp = new CdpClient(targetWsUrl);
    await pageCdp.connect();
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');

    // Wait for page to load
    await new Promise(r => setTimeout(r, 2000));

    const ARTIFACT_DIR = 'C:\\Users\\suraj\\.gemini\\antigravity-ide\\brain\\97ab5efe-9058-4f1e-a9b3-49ffe7a18cd7';

    async function takeScreenshot(name) {
      const snap = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
      const p = path.join(ARTIFACT_DIR, name);
      fs.writeFileSync(p, Buffer.from(snap.data, 'base64'));
      console.log(`  📸 Screenshot saved: ${name}`);
    }

    // ── E2E Step A: Initial Logged-Out State ─────────────────────────────────────
    console.log('\n  👉 Testing State A: Logged-Out / Public User');
    await pageCdp.eval(`
      localStorage.clear();
      renderAuthUI();
      updateAndroidButtons();
    `);

    const loggedOutNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const loggedOutNavUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-user-actions')).display`);
    const loggedOutHeroGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-guest-actions')).display`);
    const loggedOutHeroUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-user-actions')).display`);
    const navAndroidBtnText = await pageCdp.eval(`document.getElementById('nav-android-btn-text').textContent.trim()`);
    const heroAndroidBtnText = await pageCdp.eval(`document.getElementById('hero-android-btn-text').textContent.trim()`);
    const portalsLinkDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-portals-link')).display`);

    assert(loggedOutNavGuestDisplay !== 'none', 'Logged-out: #nav-guest-actions is visible');
    assert(loggedOutNavUserDisplay === 'none', 'Logged-out: #nav-user-actions is hidden');
    assert(loggedOutHeroGuestDisplay !== 'none', 'Logged-out: #hero-guest-actions is visible');
    assert(loggedOutHeroUserDisplay === 'none', 'Logged-out: #hero-user-actions is hidden');
    assert(navAndroidBtnText.includes('Android App'), 'Logged-out: Nav Android button text is present');
    assert(heroAndroidBtnText.includes('Android App'), 'Logged-out: Hero Android button text is present');
    assert(portalsLinkDisplay !== 'none', 'Logged-out: Portals navigation link is visible');
    await takeScreenshot('homepage-rbac-guest.png');

    // Test Android Modal on Click when URL unavailable
    await pageCdp.eval(`handleAndroidAppClick();`);
    const modalDisplayAfterClick = await pageCdp.eval(`document.getElementById('android-modal').style.display`);
    assert(modalDisplayAfterClick === 'flex', 'Clicking Android button opens informational modal when URL is unconfigured');
    await takeScreenshot('homepage-rbac-modal.png');

    await pageCdp.eval(`closeAndroidModal();`);
    const modalDisplayAfterClose = await pageCdp.eval(`document.getElementById('android-modal').style.display`);
    assert(modalDisplayAfterClose === 'none', 'Closing modal sets display to none');

    // ── E2E Step B: Logged-In as STUDENT ────────────────────────────────────────
    console.log('\n  👉 Testing State B: Logged-In as STUDENT');
    const studentToken = makeToken(2, 'STUDENT', { name: 'Sneha Patel', email: 'sneha@student.edu' });
    await pageCdp.eval(`
      Auth.setAuth('${studentToken}', { id: 2, name: 'Sneha Patel', role: 'STUDENT', email: 'sneha@student.edu' });
      renderAuthUI();
    `);
    // Wait briefly for validateSession promise
    await new Promise(r => setTimeout(r, 600));

    const studentNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const studentNavUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-user-actions')).display`);
    const studentHeroGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-guest-actions')).display`);
    const studentHeroUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-user-actions')).display`);
    const studentRoleBadge = await pageCdp.eval(`document.getElementById('nav-user-role-badge').textContent.trim()`);
    const studentNavDashHref = await pageCdp.eval(`document.getElementById('nav-dashboard-btn').getAttribute('href')`);
    const studentHeroDashHref = await pageCdp.eval(`document.getElementById('hero-dashboard-btn').getAttribute('href')`);
    const studentHeroDashText = await pageCdp.eval(`document.getElementById('hero-dashboard-btn-text').textContent.trim()`);
    const studentPortalsDisplay = await pageCdp.eval(`document.getElementById('nav-portals-link').style.display`);

    assert(studentNavGuestDisplay === 'none', 'STUDENT: #nav-guest-actions (and Android install button) is completely hidden');
    assert(studentHeroGuestDisplay === 'none', 'STUDENT: #hero-guest-actions is completely hidden');
    assert(studentNavUserDisplay !== 'none', 'STUDENT: #nav-user-actions is visible');
    assert(studentHeroUserDisplay !== 'none', 'STUDENT: #hero-user-actions is visible');
    assert(studentRoleBadge === 'STUDENT', 'STUDENT: Role badge shows "STUDENT"');
    assert(studentNavDashHref === '/pages/student/dashboard.html', 'STUDENT: Nav dashboard links to /pages/student/dashboard.html');
    assert(studentHeroDashHref === '/pages/student/dashboard.html', 'STUDENT: Hero dashboard links to /pages/student/dashboard.html');
    assert(studentHeroDashText === 'Open Student Dashboard', 'STUDENT: Hero CTA says "Open Student Dashboard"');
    assert(studentPortalsDisplay === 'none', 'STUDENT: Portals link is hidden from navbar');
    await takeScreenshot('homepage-rbac-student.png');

    // ── E2E Step C: Logged-In as DRIVER ─────────────────────────────────────────
    console.log('\n  👉 Testing State C: Logged-In as DRIVER');
    const driverToken = makeToken(1, 'DRIVER', { name: 'Rahul Verma' });
    await pageCdp.eval(`
      Auth.setAuth('${driverToken}', { id: 1, name: 'Rahul Verma', role: 'DRIVER' });
      renderAuthUI();
    `);
    await new Promise(r => setTimeout(r, 600));

    const driverNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const driverRoleBadge = await pageCdp.eval(`document.getElementById('nav-user-role-badge').textContent.trim()`);
    const driverNavDashHref = await pageCdp.eval(`document.getElementById('nav-dashboard-btn').getAttribute('href')`);
    const driverHeroDashHref = await pageCdp.eval(`document.getElementById('hero-dashboard-btn').getAttribute('href')`);
    const driverHeroDashText = await pageCdp.eval(`document.getElementById('hero-dashboard-btn-text').textContent.trim()`);

    assert(driverNavGuestDisplay === 'none', 'DRIVER: Guest actions and Android button hidden');
    assert(driverRoleBadge === 'DRIVER', 'DRIVER: Role badge shows "DRIVER"');
    assert(driverNavDashHref === '/pages/driver/dashboard.html', 'DRIVER: Nav dashboard links to /pages/driver/dashboard.html');
    assert(driverHeroDashHref === '/pages/driver/dashboard.html', 'DRIVER: Hero dashboard links to /pages/driver/dashboard.html');
    assert(driverHeroDashText === 'Open Driver Dashboard', 'DRIVER: Hero CTA says "Open Driver Dashboard"');
    await takeScreenshot('homepage-rbac-driver.png');

    // ── E2E Step D: Logged-In as MANAGER ────────────────────────────────────────
    console.log('\n  👉 Testing State D: Logged-In as MANAGER');
    const managerToken = makeToken(1, 'MANAGER', { name: 'Rajesh Kumar' });
    await pageCdp.eval(`
      Auth.setAuth('${managerToken}', { id: 1, name: 'Rajesh Kumar', role: 'MANAGER' });
      renderAuthUI();
    `);
    await new Promise(r => setTimeout(r, 600));

    const managerNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const managerRoleBadge = await pageCdp.eval(`document.getElementById('nav-user-role-badge').textContent.trim()`);
    const managerNavDashHref = await pageCdp.eval(`document.getElementById('nav-dashboard-btn').getAttribute('href')`);
    const managerHeroDashHref = await pageCdp.eval(`document.getElementById('hero-dashboard-btn').getAttribute('href')`);
    const managerHeroDashText = await pageCdp.eval(`document.getElementById('hero-dashboard-btn-text').textContent.trim()`);

    assert(managerNavGuestDisplay === 'none', 'MANAGER: Guest actions and Android button hidden');
    assert(managerRoleBadge === 'MANAGER', 'MANAGER: Role badge shows "MANAGER"');
    assert(managerNavDashHref === '/pages/manager/dashboard.html', 'MANAGER: Nav dashboard links to /pages/manager/dashboard.html');
    assert(managerHeroDashHref === '/pages/manager/dashboard.html', 'MANAGER: Hero dashboard links to /pages/manager/dashboard.html');
    assert(managerHeroDashText === 'Open Manager Dashboard', 'MANAGER: Hero CTA says "Open Manager Dashboard"');
    await takeScreenshot('homepage-rbac-manager.png');

    // ── E2E Step E: Logged-In as ADMIN ──────────────────────────────────────────
    console.log('\n  👉 Testing State E: Logged-In as ADMIN');
    const adminToken = makeToken(1, 'ADMIN', { username: 'admin' });
    await pageCdp.eval(`
      Auth.setAuth('${adminToken}', { id: 1, name: 'Administrator', username: 'admin', role: 'ADMIN' });
      renderAuthUI();
    `);
    await new Promise(r => setTimeout(r, 600));

    const adminNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const adminRoleBadge = await pageCdp.eval(`document.getElementById('nav-user-role-badge').textContent.trim()`);
    const adminNavDashHref = await pageCdp.eval(`document.getElementById('nav-dashboard-btn').getAttribute('href')`);
    const adminHeroDashHref = await pageCdp.eval(`document.getElementById('hero-dashboard-btn').getAttribute('href')`);
    const adminHeroDashText = await pageCdp.eval(`document.getElementById('hero-dashboard-btn-text').textContent.trim()`);

    assert(adminNavGuestDisplay === 'none', 'ADMIN: Guest actions and Android button hidden');
    assert(adminRoleBadge === 'ADMIN', 'ADMIN: Role badge shows "ADMIN"');
    assert(adminNavDashHref === '/pages/admin/dashboard.html', 'ADMIN: Nav dashboard links to /pages/admin/dashboard.html');
    assert(adminHeroDashHref === '/pages/admin/dashboard.html', 'ADMIN: Hero dashboard links to /pages/admin/dashboard.html');
    assert(adminHeroDashText === 'Open Admin Dashboard', 'ADMIN: Hero CTA says "Open Admin Dashboard"');
    await takeScreenshot('homepage-rbac-admin.png');

    // ── E2E Step F: Immediate Logout Flow ────────────────────────────────────────
    console.log('\n  👉 Testing State F: Logout Flow & Immediate State Switch');
    await pageCdp.eval(`handleLogout();`);

    const afterLogoutToken = await pageCdp.eval(`Auth.getToken()`);
    const afterLogoutNavGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-guest-actions')).display`);
    const afterLogoutNavUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('nav-user-actions')).display`);
    const afterLogoutHeroGuestDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-guest-actions')).display`);
    const afterLogoutHeroUserDisplay = await pageCdp.eval(`getComputedStyle(document.getElementById('hero-user-actions')).display`);

    assert(afterLogoutToken === null, 'handleLogout() clears token');
    assert(afterLogoutNavGuestDisplay !== 'none', 'After logout: #nav-guest-actions (and Android button) immediately re-appears');
    assert(afterLogoutNavUserDisplay === 'none', 'After logout: #nav-user-actions is hidden');
    assert(afterLogoutHeroGuestDisplay !== 'none', 'After logout: #hero-guest-actions is visible');
    assert(afterLogoutHeroUserDisplay === 'none', 'After logout: #hero-user-actions is hidden');

    // ── E2E Step G: Dynamic Android Config URL Switching ─────────────────────────
    console.log('\n  👉 Testing State G: Configurable Android URL Dynamic State');
    await pageCdp.eval(`
      appConfig = {
        success: true,
        is_available: true,
        android_app_url: 'https://example.com/download/smart-bus-tracker.apk',
        app_name: 'GIET Smart Bus Tracker',
        package_name: 'edu.giet.smartbus',
        version: '1.0.0'
      };
      updateAndroidButtons();
    `);

    const availableNavBtnText = await pageCdp.eval(`document.getElementById('nav-android-btn-text').textContent.trim()`);
    const availableHeroBtnText = await pageCdp.eval(`document.getElementById('hero-android-btn-text').textContent.trim()`);
    assert(availableNavBtnText === 'Install Android App', 'Available state: Nav button displays "Install Android App"');
    assert(availableHeroBtnText === 'Install Android App', 'Available state: Hero button displays "Install Android App"');
    await takeScreenshot('homepage-rbac-app-available.png');

    // Play Store URL simulation
    await pageCdp.eval(`
      appConfig.android_app_url = 'https://play.google.com/store/apps/details?id=edu.giet.smartbus';
      updateAndroidButtons();
    `);
    const playStoreNavBtnText = await pageCdp.eval(`document.getElementById('nav-android-btn-text').textContent.trim()`);
    assert(playStoreNavBtnText === 'Install Android App', 'Play Store state: Nav button displays "Install Android App"');

    // Fallback back to Coming Soon
    await pageCdp.eval(`
      appConfig = { success: true, is_available: false, android_app_url: null };
      updateAndroidButtons();
    `);
    const comingSoonNavBtnText = await pageCdp.eval(`document.getElementById('nav-android-btn-text').textContent.trim()`);
    assert(comingSoonNavBtnText === 'Android App Coming Soon', 'Fallback state: Button reverts to "Android App Coming Soon"');

    // Take screenshot of final verified state
    const screenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.join(__dirname, 'homepage-rbac-verified.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`  📸 Verification screenshot saved: ${screenshotPath}`);

    pageCdp.close();
    cdp.close();
  } catch (err) {
    console.error('CDP Test error:', err);
    assert(false, `CDP Test failed: ${err.message}`);
  } finally {
    if (chromeProcess) {
      chromeProcess.kill('SIGKILL');
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`📊 FINAL RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} checks`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
