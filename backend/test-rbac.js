/**
 * test-rbac.js
 * Comprehensive Automated RBAC Test Suite for Smart University Bus Tracking System
 *
 * Verifies all requirements from prompt:
 * 1. Role Definitions & Normalization (ADMIN, MANAGER, DRIVER, STUDENT)
 * 2. Authentication vs Authorization (No token, invalid, expired)
 * 3. Role-Based Access Control matrix for all 4 roles
 * 4. Resource-Level Authorization (Manager bus assignment, Driver bus assignment)
 * 5. Admin User Management security (prevent creating Admin, protect primary Admin)
 * 6. Session revocation for deleted user accounts (immediately 401)
 * 7. Security audit logging (UNAUTHORIZED_ACCESS_ATTEMPT, USER_CREATED, etc.)
 */

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const jwtConfig = require('./config/jwt');
const { ROLES, normalizeRole, isValidRole } = require('./utils/roles');
const { activityLogger } = require('./middleware/auth');

// Create test app instance
const app = express();
app.use(express.json());
app.use(activityLogger(db));

// Mount identical routes
app.use('/api/v1/auth',     require('./routes/auth'));
app.use('/api/v1/students', require('./routes/student'));
app.use('/api/v1/buses',    require('./routes/bus'));
app.use('/api/v1/routes',   require('./routes/route'));
app.use('/api/v1/trips',    require('./routes/trip'));
app.use('/api/v1/driver',   require('./routes/driver'));
app.use('/api/v1',          require('./routes/admin'));
app.use('/api/v1',          require('./routes/misc'));

const TEST_PORT = 5099;
let server;

// Helper to make HTTP requests
function request(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:${TEST_PORT}${path}`);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const req = http.request(url, {
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function createToken(payload, options = {}) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: options.expiresIn || '1h'
  });
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? '— ' + details : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🛡️  SMART UNIVERSITY BUS TRACKING — RBAC TEST SUITE');
  console.log('======================================================\n');

  server = app.listen(TEST_PORT);
  await new Promise(r => setTimeout(r, 200));

  try {
    // ── SECTION 1: ROLE DEFINITIONS & UTILS ────────────────────────────────
    console.log('📌 [1] Standard Role Definitions & Normalization');
    assert(ROLES.ADMIN === 'ADMIN', 'ROLES.ADMIN is ADMIN');
    assert(ROLES.MANAGER === 'MANAGER', 'ROLES.MANAGER is MANAGER');
    assert(ROLES.DRIVER === 'DRIVER', 'ROLES.DRIVER is DRIVER');
    assert(ROLES.STUDENT === 'STUDENT', 'ROLES.STUDENT is STUDENT');
    assert(normalizeRole('admin') === 'ADMIN', "normalizeRole('admin') is 'ADMIN'");
    assert(normalizeRole('MANAGER') === 'MANAGER', "normalizeRole('MANAGER') is 'MANAGER'");
    assert(isValidRole('driver') === true, "isValidRole('driver') is true");
    assert(isValidRole('superadmin') === false, "isValidRole('superadmin') is false");

    // Fetch existing users from database
    const adminUser = db.prepare('SELECT admin_id as id, username, email FROM admins WHERE admin_id = 1').get();
    const manager1 = db.prepare('SELECT manager_id as id, name, email FROM managers WHERE manager_id = 1').get();
    const manager2 = db.prepare('SELECT manager_id as id, name, email FROM managers WHERE manager_id = 2').get();
    const driver1 = db.prepare('SELECT driver_id as id, name, email FROM drivers WHERE driver_id = 1').get();
    const student1 = db.prepare('SELECT student_id as id, name, email FROM students ORDER BY student_id ASC LIMIT 1').get();

    const adminToken = createToken({ id: adminUser.id, role: ROLES.ADMIN, username: adminUser.username });
    const manager1Token = createToken({ id: manager1.id, role: ROLES.MANAGER, email: manager1.email });
    const manager2Token = createToken({ id: manager2.id, role: ROLES.MANAGER, email: manager2.email });
    const driver1Token = createToken({ id: driver1.id, role: ROLES.DRIVER, email: driver1.email });
    const student1Token = createToken({ id: student1.id, role: ROLES.STUDENT, email: student1.email });

    // ── SECTION 2: AUTHENTICATION vs AUTHORIZATION ─────────────────────────
    console.log('\n📌 [2] Authentication vs Authorization (Token Validation)');

    // 2.1 No token -> 401
    const resNoToken = await request('GET', '/api/v1/admin/users');
    assert(resNoToken.status === 401, 'No JWT token returns 401 Unauthorized');

    // 2.2 Invalid token -> 401
    const resInvalidToken = await request('GET', '/api/v1/admin/users', { token: 'invalid.token.here' });
    assert(resInvalidToken.status === 401, 'Malformed JWT token returns 401 Unauthorized');

    // 2.3 Expired token -> 401
    const expiredToken = jwt.sign({ id: 1, role: 'ADMIN' }, jwtConfig.secret, { expiresIn: '0s' });
    const resExpired = await request('GET', '/api/v1/admin/users', { token: expiredToken });
    assert(resExpired.status === 401, 'Expired JWT token returns 401 Unauthorized');

    // 2.4 User attempting to send role in body to bypass auth
    const resFakeRole = await request('POST', '/api/v1/buses', {
      token: student1Token,
      body: { role: 'ADMIN', bus_number: 'BUS-HACK', registration_number: 'OD-HACK-01', capacity: 40 }
    });
    assert(resFakeRole.status === 403, 'Client sending { role: "ADMIN" } is rejected with 403 Forbidden');

    // ── SECTION 3: STUDENT ROLE RESTRICTIONS ───────────────────────────────
    console.log('\n📌 [3] Student Role Permissions & Restrictions');

    // Student self-service allowed
    const resStudentProfile = await request('GET', '/api/v1/students/profile', { token: student1Token });
    assert(resStudentProfile.status === 200, 'Student can view own profile (200)');

    const resStudentBuses = await request('GET', '/api/v1/buses', { token: student1Token });
    assert(resStudentBuses.status === 200, 'Student can view live buses list (200)');

    // Student calling Admin APIs -> 403
    const resStudentAdminUsers = await request('GET', '/api/v1/admin/users', { token: student1Token });
    assert(resStudentAdminUsers.status === 403, 'Student calling Admin users API returns 403 Forbidden');

    const resStudentStats = await request('GET', '/api/v1/stats', { token: student1Token });
    assert(resStudentStats.status === 403, 'Student calling Admin stats returns 403 Forbidden');

    const resStudentLogs = await request('GET', '/api/v1/activity-logs', { token: student1Token });
    assert(resStudentLogs.status === 403, 'Student calling activity logs returns 403 Forbidden');

    // Student calling Manager APIs -> 403
    const resStudentManagerBuses = await request('GET', '/api/v1/buses/my-buses', { token: student1Token });
    assert(resStudentManagerBuses.status === 403, 'Student calling Manager my-buses returns 403 Forbidden');

    // Student attempting operational actions -> 403
    const resStudentCreateBus = await request('POST', '/api/v1/buses', {
      token: student1Token,
      body: { bus_number: 'TEST-BUS', registration_number: 'OD-TEST-01', capacity: 30 }
    });
    assert(resStudentCreateBus.status === 403, 'Student cannot create bus (403)');

    const resStudentCreateRoute = await request('POST', '/api/v1/routes', {
      token: student1Token,
      body: { route_name: 'Test Route', source: 'A', destination: 'B' }
    });
    assert(resStudentCreateRoute.status === 403, 'Student cannot create route (403)');

    const resStudentStartTrip = await request('POST', '/api/v1/trips/start', {
      token: student1Token,
      body: { bus_id: 1, driver_id: 1, route_id: 1 }
    });
    assert(resStudentStartTrip.status === 403, 'Student cannot start trip (403)');

    const resStudentDriverTrip = await request('POST', '/api/v1/driver/start-trip', {
      token: student1Token,
      body: { bus_id: 1 }
    });
    assert(resStudentDriverTrip.status === 403, 'Student cannot call driver start-trip API (403)');

    // ── SECTION 4: DRIVER ROLE RESTRICTIONS & BUS ASSIGNMENT ───────────────
    console.log('\n📌 [4] Driver Role Permissions & Resource Assignment Checks');

    // Driver self-service
    const resDriverMyBus = await request('GET', '/api/v1/driver/my-bus', { token: driver1Token });
    assert(resDriverMyBus.status === 200, 'Driver can view assigned bus (200)');

    // Driver calling Admin APIs -> 403
    const resDriverUsers = await request('GET', '/api/v1/admin/users', { token: driver1Token });
    assert(resDriverUsers.status === 403, 'Driver calling Admin users API returns 403 Forbidden');

    const resDriverManagers = await request('GET', '/api/v1/managers', { token: driver1Token });
    assert(resDriverManagers.status === 403, 'Driver calling Manager management returns 403 Forbidden');

    const resDriverCreateBus = await request('POST', '/api/v1/buses', {
      token: driver1Token,
      body: { bus_number: 'DRV-BUS', registration_number: 'OD-DRV-01', capacity: 30 }
    });
    assert(resDriverCreateBus.status === 403, 'Driver cannot create bus (403)');

    // Resource Authorization: Driver 1 is assigned to Bus 1, NOT Bus 2 or Bus 3!
    const resDriverStartUnassigned = await request('POST', '/api/v1/driver/start-trip', {
      token: driver1Token,
      body: { bus_id: 2 } // Driver 1 tries to start Bus 2
    });
    assert(resDriverStartUnassigned.status === 403, 'Driver starting unassigned bus returns 403 Forbidden');

    // ── SECTION 5: MANAGER ROLE PERMISSIONS & RESOURCE OWNERSHIP ───────────
    console.log('\n📌 [5] Manager Role Permissions & Resource Ownership Checks');

    // Manager 1 viewing assigned buses
    const resMgr1Buses = await request('GET', '/api/v1/buses/my-buses', { token: manager1Token });
    assert(resMgr1Buses.status === 200, 'Manager can view own assigned buses (200)');

    // Manager calling Admin-only APIs -> 403
    const resMgrUsers = await request('GET', '/api/v1/admin/users', { token: manager1Token });
    assert(resMgrUsers.status === 403, 'Manager calling Admin user management returns 403 Forbidden');

    const resMgrCreateBus = await request('POST', '/api/v1/buses', {
      token: manager1Token,
      body: { bus_number: 'MGR-BUS', registration_number: 'OD-MGR-01', capacity: 30 }
    });
    assert(resMgrCreateBus.status === 403, 'Manager cannot create bus (403)');

    const resMgrManagers = await request('GET', '/api/v1/managers', { token: manager1Token });
    assert(resMgrManagers.status === 403, 'Manager cannot manage other managers (403)');

    const resMgrStats = await request('GET', '/api/v1/stats', { token: manager1Token });
    assert(resMgrStats.status === 403, 'Manager cannot access system stats (403)');

    const resMgrLogs = await request('GET', '/api/v1/activity-logs', { token: manager1Token });
    assert(resMgrLogs.status === 403, 'Manager cannot access activity logs (403)');

    // Resource Authorization:
    // Bus 1 has manager_id = 1. Bus 3 has manager_id = 2.
    // Manager 1 updating Bus 1 status -> 200 OK
    const resMgr1UpdateBus1 = await request('PUT', '/api/v1/buses/1/status', {
      token: manager1Token,
      body: { status: 'running' }
    });
    assert(resMgr1UpdateBus1.status === 200, 'Manager 1 can update assigned Bus 1 status (200)');

    // Manager 1 updating Bus 3 status -> 403 Forbidden (Ownership check!)
    const resMgr1UpdateBus3 = await request('PUT', '/api/v1/buses/3/status', {
      token: manager1Token,
      body: { status: 'running' }
    });
    assert(resMgr1UpdateBus3.status === 403, 'Manager 1 updating UNASSIGNED Bus 3 returns 403 Forbidden');

    // Manager 2 updating Bus 3 status -> 200 OK (Manager 2 owns Bus 3)
    const resMgr2UpdateBus3 = await request('PUT', '/api/v1/buses/3/status', {
      token: manager2Token,
      body: { status: 'running' }
    });
    assert(resMgr2UpdateBus3.status === 200, 'Manager 2 can update assigned Bus 3 status (200)');

    // Manager 2 updating Bus 1 status -> 403 Forbidden
    const resMgr2UpdateBus1 = await request('PUT', '/api/v1/buses/1/status', {
      token: manager2Token,
      body: { status: 'running' }
    });
    assert(resMgr2UpdateBus1.status === 403, 'Manager 2 updating UNASSIGNED Bus 1 returns 403 Forbidden');

    // ── SECTION 6: ADMIN ROLE FULL ACCESS & RESTRICTIONS ───────────────────
    console.log('\n📌 [6] Admin Role Full Access & Account Protection');

    // Admin view stats & users
    const resAdminStats = await request('GET', '/api/v1/stats', { token: adminToken });
    assert(resAdminStats.status === 200, 'Admin can view stats (200)');

    const resAdminUsers = await request('GET', '/api/v1/admin/users', { token: adminToken });
    assert(resAdminUsers.status === 200, 'Admin can view all users (200)');

    // Admin unrestricted operational access to any bus (even Bus 3)
    const resAdminUpdateBus3 = await request('PUT', '/api/v1/buses/3/status', {
      token: adminToken,
      body: { status: 'inactive' }
    });
    assert(resAdminUpdateBus3.status === 200, 'Admin has unrestricted operational access across all buses (200)');

    // Admin creating user with role: 'ADMIN' -> REJECTED (400)
    const resAdminCreateAdmin = await request('POST', '/api/v1/admin/users', {
      token: adminToken,
      body: { role: 'ADMIN', name: 'New Admin', email: 'admin2@giet.edu' }
    });
    assert(resAdminCreateAdmin.status === 400, 'Admin creating another ADMIN account is rejected with 400 Bad Request');

    // Admin creating valid Student -> 201
    const testEmail = `student.rbac.${Date.now()}@giet.edu`;
    const resCreateStudent = await request('POST', '/api/v1/admin/users', {
      token: adminToken,
      body: {
        role: 'student',
        name: 'RBAC Test Student',
        email: testEmail,
        department: 'CSE',
        semester: 4,
        phone: '9876543210'
      }
    });
    assert(resCreateStudent.status === 201, 'Admin can create Student account (201)');
    const createdUserId = resCreateStudent.data?.user?.system_user_id || resCreateStudent.data?.user_id;

    // Admin deleting created student -> 200
    if (createdUserId) {
      const resDeleteStudent = await request('DELETE', `/api/v1/admin/users/${createdUserId}`, { token: adminToken });
      assert(resDeleteStudent.status === 200, 'Admin can delete user (200)');
    }

    // Admin attempting to delete primary system admin account -> REJECTED (403)
    const resDeleteAdmin = await request('DELETE', '/api/v1/admin/users/1', { token: adminToken });
    assert(resDeleteAdmin.status === 403, 'Deleting primary system administrator account is blocked with 403 Forbidden');

    // ── SECTION 7: DELETED USER TOKEN IMMEDIATE REVOCATION ─────────────────
    console.log('\n📌 [7] Deleted User Account & Session Invalidation');

    // Create a temporary driver to test token revocation
    const tempDriverEmail = `temp.driver.${Date.now()}@giet.edu`;
    const resCreateDriver = await request('POST', '/api/v1/admin/users', {
      token: adminToken,
      body: {
        role: 'driver',
        name: 'Temp Driver',
        email: tempDriverEmail,
        license_number: `DL-${Date.now()}`
      }
    });
    const tempDriverId = resCreateDriver.data?.user?.id || resCreateDriver.data?.record_id;
    const tempDriverSystemId = resCreateDriver.data?.user?.system_user_id;

    if (tempDriverId) {
      const tempDriverToken = createToken({ id: tempDriverId, role: ROLES.DRIVER, email: tempDriverEmail });

      // Before deletion, token is valid
      const resBeforeDelete = await request('GET', '/api/v1/driver/pickup-points', { token: tempDriverToken });
      assert(resBeforeDelete.status === 200, 'Active user token functions normally (200)');

      // Delete the driver
      await request('DELETE', `/api/v1/admin/users/${tempDriverSystemId}`, { token: adminToken });

      // After deletion, old token MUST be immediately revoked (401)
      const resAfterDelete = await request('GET', '/api/v1/driver/pickup-points', { token: tempDriverToken });
      assert(resAfterDelete.status === 401, 'Deleted user old token is immediately rejected with 401 Unauthorized');
    }

    // ── SECTION 8: AUDIT LOGGING VERIFICATION ──────────────────────────────
    console.log('\n📌 [8] Security Audit Logging Verification');
    const logs = db.prepare('SELECT action, details FROM activity_logs ORDER BY log_id DESC LIMIT 10').all();
    const actions = logs.map(l => l.action);

    const hasUnauthorizedAttempt = actions.includes('UNAUTHORIZED_ACCESS_ATTEMPT');
    assert(hasUnauthorizedAttempt, 'activity_logs recorded UNAUTHORIZED_ACCESS_ATTEMPT');

    const hasUserCreated = actions.includes('USER_CREATED');
    assert(hasUserCreated, 'activity_logs recorded USER_CREATED');

    const hasUserDeleted = actions.includes('USER_DELETED');
    assert(hasUserDeleted, 'activity_logs recorded USER_DELETED');

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    server.close();
    console.log('\n======================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
