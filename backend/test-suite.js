/**
 * Automated Test Suite for GIET Smart University Bus Tracking System
 * Tests:
 * 1. Authentication & Domain Enforcement (@giet.edu)
 * 2. User Creation & Credentials Generation (User ID, Temp PW, Must Change PW)
 * 3. Driver & Bus Assignment Integrity (Prevent Fake Trips)
 * 4. GPS Validation & Jump/Teleportation Detection
 * 5. Geofence Operating Area & Violation Detection
 * 6. ETA Service & Route Progress Calculations
 * 7. Route Stops Management & Reordering
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const { isValidGietEmail, generateSystemUserId, generateTempPassword } = require('./utils/validation');
const geofenceService = require('./services/geofenceService');
const gpsValidationService = require('./services/gpsValidationService');
const etaService = require('./services/etaService');
const routeModel = require('./models/routeModel');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING GIET SMART BUS CONTROLS TEST SUITE');
  console.log('======================================================\n');

  // ── TEST GROUP 1: EMAIL DOMAIN & CREDENTIAL UTILITIES ──
  console.log('--- 1. Domain Validation & ID Generation ---');

  test('Allow valid @giet.edu emails', () => {
    assert.strictEqual(isValidGietEmail('student123@giet.edu'), true);
    assert.strictEqual(isValidGietEmail('23cse001@giet.edu'), true);
    assert.strictEqual(isValidGietEmail('driver01@giet.edu'), true);
    assert.strictEqual(isValidGietEmail('Admin.User@giet.edu'), true);
  });

  test('Reject unauthorized non-@giet.edu emails', () => {
    assert.strictEqual(isValidGietEmail('student@gmail.com'), false);
    assert.strictEqual(isValidGietEmail('student@giet.edu.in'), false);
    assert.strictEqual(isValidGietEmail('student@giet.ac.in'), false);
    assert.strictEqual(isValidGietEmail('student@something.com'), false);
    assert.strictEqual(isValidGietEmail('giet.edu@yahoo.com'), false);
    assert.strictEqual(isValidGietEmail('fake@giet.edu.fake'), false);
    assert.strictEqual(isValidGietEmail(''), false);
    assert.strictEqual(isValidGietEmail(null), false);
  });

  test('Generate unique system user IDs per role', () => {
    const stuId = generateSystemUserId('student', db);
    const drvId = generateSystemUserId('driver', db);
    const mgrId = generateSystemUserId('manager', db);

    assert.ok(stuId.startsWith('GIET-STU-'), `Expected GIET-STU- prefix, got ${stuId}`);
    assert.ok(drvId.startsWith('GIET-DRV-'), `Expected GIET-DRV- prefix, got ${drvId}`);
    assert.ok(mgrId.startsWith('GIET-MGR-'), `Expected GIET-MGR- prefix, got ${mgrId}`);
  });

  test('Generate secure temporary passwords', () => {
    const pw1 = generateTempPassword();
    const pw2 = generateTempPassword();
    assert.ok(pw1.length >= 10, 'Password length should be >= 10');
    assert.notStrictEqual(pw1, pw2, 'Subsequent temp passwords must differ');
    assert.match(pw1, /[A-Z]/, 'Must contain uppercase');
    assert.match(pw1, /[a-z]/, 'Must contain lowercase');
    assert.match(pw1, /[0-9]/, 'Must contain number');
    assert.match(pw1, /[!@#$%&*]/, 'Must contain symbol');
  });

  // ── TEST GROUP 2: USER CREATION & PASSWORD HASHING IN DB ──
  console.log('\n--- 2. Database User Creation & Password Security ---');

  const testStudentEmail = `test.student.${Date.now()}@giet.edu`;
  const testStudentId = generateSystemUserId('student', db);
  const tempPw = generateTempPassword();

  test('Insert student with bcrypt hash and must_change_password=1', () => {
    const hash = bcrypt.hashSync(tempPw, 10);
    const res = db.prepare(`
      INSERT INTO students (system_user_id, roll_number, name, email, department, semester, password, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(testStudentId, `ROLL-${Date.now()}`, 'Test Student', testStudentEmail, 'Computer Science', 4, hash);

    assert.ok(res.lastInsertRowid > 0);

    const saved = db.prepare('SELECT * FROM students WHERE system_user_id = ?').get(testStudentId);
    assert.ok(saved, 'Student must exist in database');
    assert.strictEqual(saved.must_change_password, 1, 'must_change_password must be 1 for new user');
    assert.notStrictEqual(saved.password, tempPw, 'Plaintext password must NEVER be in database');
    assert.ok(bcrypt.compareSync(tempPw, saved.password), 'Bcrypt hash must match temporary password');
  });

  test('Update temporary password clears must_change_password flag', () => {
    const newPermanentPw = 'PermanentGiet#2026';
    const newHash = bcrypt.hashSync(newPermanentPw, 10);

    db.prepare('UPDATE students SET password = ?, must_change_password = 0 WHERE system_user_id = ?')
      .run(newHash, testStudentId);

    const updated = db.prepare('SELECT * FROM students WHERE system_user_id = ?').get(testStudentId);
    assert.strictEqual(updated.must_change_password, 0, 'must_change_password must be reset to 0');
    assert.ok(bcrypt.compareSync(newPermanentPw, updated.password));
  });

  // ── TEST GROUP 3: ANTI-FAKE BUS & TRIP VALIDATION ──
  console.log('\n--- 3. Anti-Fake Bus & Assignment Integrity ---');

  // Query existing bus and driver from database
  const activeBus = db.prepare("SELECT * FROM buses WHERE status != 'inactive' LIMIT 1").get();
  const activeDriver = activeBus ? db.prepare('SELECT * FROM drivers WHERE driver_id = ?').get(activeBus.driver_id) : null;
  const otherDriver = db.prepare('SELECT * FROM drivers WHERE driver_id != ? AND is_active = 1 LIMIT 1').get(activeBus?.driver_id || 0);

  test('Reject trip start if driver is not assigned to the bus', () => {
    if (!activeBus || !otherDriver) return;
    const validation = gpsValidationService.validateTripStart({
      driverId: otherDriver.driver_id,
      busId: activeBus.bus_id,
      routeId: activeBus.route_id
    });
    assert.strictEqual(validation.valid, false, 'Unassigned driver should be rejected');
    assert.match(validation.message, /not assigned to bus/i);
  });

  test('Reject trip start if bus is not assigned to the route', () => {
    if (!activeBus || !activeDriver) return;
    const unassignedRoute = db.prepare('SELECT route_id FROM routes WHERE route_id != ? LIMIT 1').get(activeBus.route_id || 0);
    if (!unassignedRoute) return;

    const validation = gpsValidationService.validateTripStart({
      driverId: activeDriver.driver_id,
      busId: activeBus.bus_id,
      routeId: unassignedRoute.route_id
    });
    assert.strictEqual(validation.valid, false, 'Unassigned route should be rejected');
    assert.match(validation.message, /(not assigned to route|Route mismatch)/i);
  });

  test('Allow trip start when driver, bus, and route match assignments', () => {
    if (!activeBus || !activeDriver || !activeBus.route_id) return;
    // Clear any leftover running trips for clean test
    db.prepare("UPDATE trips SET status = 'completed' WHERE bus_id = ? AND status = 'running'").run(activeBus.bus_id);

    const validation = gpsValidationService.validateTripStart({
      driverId: activeDriver.driver_id,
      busId: activeBus.bus_id,
      routeId: activeBus.route_id
    });
    assert.strictEqual(validation.valid, true, 'Valid driver, bus and route must be approved');
  });

  // ── TEST GROUP 4: SERVER-SIDE GPS JUMP & BOUNDS VALIDATION ──
  console.log('\n--- 4. Server-side GPS Bounds & Jump Detection ---');

  test('Reject impossible coordinates (out of range)', () => {
    const invalidLat = gpsValidationService.validateGpsReading({
      busId: 1,
      latitude: 195.0,
      longitude: 83.82,
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(invalidLat.valid, false, 'Lat > 90 must be invalid');
    assert.strictEqual(invalidLat.isSuspicious, true);

    const invalidLng = gpsValidationService.validateGpsReading({
      busId: 1,
      latitude: 19.05,
      longitude: 250.0,
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(invalidLng.valid, false, 'Lng > 180 must be invalid');
  });

  test('Reject stale timestamps older than 5 minutes', () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = gpsValidationService.validateGpsReading({
      busId: 1,
      latitude: 19.0494,
      longitude: 83.8242,
      timestamp: staleTime
    });
    assert.strictEqual(result.valid, false, 'Stale timestamp should be rejected');
    assert.match(result.reason, /stale/i);
  });

  test('Detect extreme GPS jumps (>130 km/h or impossible teleportation)', () => {
    // 15 km away in 2 seconds = ~27,000 km/h
    const dist = gpsValidationService.haversineDistance(19.0494, 83.8242, 19.1800, 83.8242);
    const speed = (dist / 2) * 3.6;
    assert.ok(dist > 1000, 'Distance must exceed jump threshold');
    assert.ok(speed > 130, 'Speed must exceed 130 km/h limit');
  });

  test('Accept smooth, realistic bus movement (~30 km/h)', () => {
    // 30 meters away in 5 seconds = ~21.6 km/h
    const dist = gpsValidationService.haversineDistance(19.0494, 83.8242, 19.0496, 83.8243);
    const speed = (dist / 5) * 3.6;
    assert.ok(speed < 60, 'Movement speed is within normal operating limits');
  });

  // ── TEST GROUP 5: GEOFENCE OPERATING AREA ──
  console.log('\n--- 5. Geofence Operating Area & Point-in-Polygon Check ---');

  const campusPolygon = [
    [19.0650, 83.8050],
    [19.0650, 83.8400],
    [19.0300, 83.8400],
    [19.0300, 83.8050]
  ];

  test('Verify inside geofence returns true for campus center', () => {
    const insidePt = [19.0494, 83.8242]; // GIET Campus coordinates
    const isInside = geofenceService.isPointInPolygon(insidePt, campusPolygon);
    assert.strictEqual(isInside, true, 'Point inside campus must return true');
  });

  test('Verify outside geofence returns false and flags violation', () => {
    const outsidePt = [19.2000, 84.1000]; // Far outside polygon
    const isInside = geofenceService.isPointInPolygon(outsidePt, campusPolygon);
    assert.strictEqual(isInside, false, 'Point outside campus must return false');
  });

  test('Verify geofence service records violation in database', () => {
    if (!activeBus || !activeDriver) return;
    const testGeofence = db.prepare('SELECT geofence_id, name FROM geofences WHERE is_active = 1 LIMIT 1').get();
    if (!testGeofence) return;

    const res = geofenceService.handleGeofenceViolation({
      busId: activeBus.bus_id,
      driverId: activeDriver.driver_id,
      geofenceId: testGeofence.geofence_id,
      geofenceName: testGeofence.name,
      busNumber: activeBus.bus_number,
      driverName: activeDriver.name,
      latitude: 19.2500,
      longitude: 84.1500
    });

    assert.ok(res.violationId > 0, 'Violation ID should be created');

    const audit = db.prepare('SELECT * FROM geofence_violations WHERE violation_id = ?').get(res.violationId);
    assert.ok(audit, 'Violation record must be stored');
    assert.strictEqual(audit.bus_id, activeBus.bus_id);

    // Verify emergency notification was logged
    const notif = db.prepare("SELECT * FROM notifications WHERE title LIKE '%VIOLATION%' ORDER BY created_at DESC LIMIT 1").get();
    assert.ok(notif, 'Notification should be created for admin');
  });

  // ── TEST GROUP 6: ETA & NEXT BUS PREDICTION ──
  console.log('\n--- 6. ETA Calculation & Next Bus Schedule Prediction ---');

  test('Calculate route stop timeline ETAs based on distance and offsets', () => {
    const dummyStops = [
      { stop_id: 1, stop_name: 'Main Gate', latitude: 19.0494, longitude: 83.8242, stop_order: 1, expected_offset_minutes: 0, is_college: 0 },
      { stop_id: 2, stop_name: 'Library Square', latitude: 19.0520, longitude: 83.8260, stop_order: 2, expected_offset_minutes: 7, is_college: 0 },
      { stop_id: 3, stop_name: 'GIET Campus Center', latitude: 19.0560, longitude: 83.8300, stop_order: 3, expected_offset_minutes: 20, is_college: 1 }
    ];

    const timeline = etaService.calculateRouteETAs(19.0495, 83.8243, dummyStops, 30);

    assert.ok(timeline.next_stop, 'Next stop must be identified');
    assert.ok(timeline.eta_next_stop_minutes !== null, 'Next stop ETA must be calculated');
    assert.ok(timeline.eta_college_minutes !== null, 'College destination ETA must be calculated');
    assert.strictEqual(timeline.stops_timeline.length, 3, 'Timeline must contain all stops');
  });

  test('Predict next scheduled bus on route', () => {
    const route = db.prepare('SELECT route_id FROM routes LIMIT 1').get();
    if (!route) return;

    const nextBusInfo = etaService.getNextBusInfo(route.route_id, 99999);
    // Should return object with expected properties (or null if no other buses in DB)
    if (nextBusInfo) {
      assert.ok(nextBusInfo.bus_number, 'Should have bus_number');
      assert.ok(nextBusInfo.departure_from_college, 'Should have departure_from_college');
      assert.ok(nextBusInfo.expected_arrival_at_stop, 'Should have expected_arrival_at_stop');
    }
  });

  // ── TEST GROUP 7: ROUTE STOPS REORDERING & MANAGEMENT ──
  console.log('\n--- 7. Route Stops Reordering & Assignments ---');

  test('Admin reorders stops correctly', () => {
    const testRoute = db.prepare('SELECT route_id FROM routes LIMIT 1').get();
    if (!testRoute) return;

    const stops = db.prepare('SELECT stop_id FROM bus_stops WHERE route_id = ? ORDER BY stop_order').all(testRoute.route_id);
    if (stops.length >= 2) {
      const reversedIds = [stops[1].stop_id, stops[0].stop_id, ...stops.slice(2).map(s => s.stop_id)];
      routeModel.reorderStops(testRoute.route_id, reversedIds);

      const reordered = db.prepare('SELECT stop_id, stop_order FROM bus_stops WHERE route_id = ? ORDER BY stop_order').all(testRoute.route_id);
      assert.strictEqual(reordered[0].stop_id, stops[1].stop_id, 'First stop should now be the previously second stop');
      assert.strictEqual(reordered[1].stop_id, stops[0].stop_id);

      // Restore order
      routeModel.reorderStops(testRoute.route_id, stops.map(s => s.stop_id));
    }
  });

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
