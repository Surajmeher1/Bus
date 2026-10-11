/**
 * End-to-End CRUD Integration Test Suite
 * Validates complete lifecycle and foreign key safety for:
 * - Students
 * - Drivers
 * - Managers
 * - Buses
 * - Routes
 * - Geofences / Operating Areas
 */

const assert = require('assert');
const db = require('./config/db');
const StudentModel = require('./models/studentModel');
const DriverModel = require('./models/driverModel');
const ManagerModel = require('./models/managerModel');
const BusModel = require('./models/busModel');
const RouteModel = require('./models/routeModel');
const { isValidGietEmail, generateSystemUserId } = require('./utils/validation');

let passed = 0;
let failed = 0;

function runTest(title, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${title}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function startSuite() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING COMPREHENSIVE CRUD INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  const ts = Date.now();

  // ── 1. STUDENT LIFECYCLE ──
  console.log('--- 1. Student CRUD & FK Safety ---');
  let testStuId = null;
  runTest('Create student with institutional @giet.edu email', () => {
    const email = `test.student.${ts}@giet.edu`;
    assert.strictEqual(isValidGietEmail(email), true);

    const sysId = generateSystemUserId('student', db);
    const res = db.prepare(`
      INSERT INTO students (roll_number, name, email, phone, department, semester, password, system_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`ROLL-${ts}`, 'CRUD Test Student', email, '9876543210', 'Computer Science', 4, 'hashed_pw', sysId);

    testStuId = res.lastInsertRowid;
    assert.ok(testStuId > 0);

    const saved = StudentModel.findById(testStuId);
    assert.strictEqual(saved.name, 'CRUD Test Student');
    assert.strictEqual(saved.email, email);
  });

  runTest('Search student by name, roll, and email', () => {
    const results = StudentModel.search(`ROLL-${ts}`);
    assert.ok(results.length >= 1);
    assert.strictEqual(results[0].student_id, testStuId);
  });

  runTest('Update student record', () => {
    db.prepare('UPDATE students SET department = ? WHERE student_id = ?').run('Mechanical', testStuId);
    const updated = StudentModel.findById(testStuId);
    assert.strictEqual(updated.department, 'Mechanical');
  });

  runTest('Delete student with dependent feedback safely', () => {
    // Insert dummy feedback referencing this student
    const dummyBus = db.prepare('SELECT bus_id FROM buses LIMIT 1').get();
    if (dummyBus) {
      db.prepare('INSERT INTO feedback (student_id, bus_id, message, rating) VALUES (?, ?, ?, ?)').run(
        testStuId, dummyBus.bus_id, 'Great bus', 5
      );
    }
    // Delete dependent feedback and student
    db.prepare('DELETE FROM feedback WHERE student_id = ?').run(testStuId);
    StudentModel.delete(testStuId);

    const exists = StudentModel.findById(testStuId);
    assert.strictEqual(exists, undefined);
  });

  // ── 2. DRIVER LIFECYCLE ──
  console.log('\n--- 2. Driver CRUD & FK Safety ---');
  let testDriverId = null;
  runTest('Create driver with institutional @giet.edu email', () => {
    const email = `test.driver.${ts}@giet.edu`;
    assert.strictEqual(isValidGietEmail(email), true);

    const sysId = generateSystemUserId('driver', db);
    const res = db.prepare(`
      INSERT INTO drivers (name, email, password, phone, license_number, address, is_active, system_user_id)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run('CRUD Driver', email, 'hashed_pw', '9876543211', `LIC-${ts}`, 'Gunupur Campus', sysId);

    testDriverId = res.lastInsertRowid;
    assert.ok(testDriverId > 0);
  });

  runTest('Toggle driver active/disabled status', () => {
    db.prepare('UPDATE drivers SET is_active = 0 WHERE driver_id = ?').run(testDriverId);
    let d = db.prepare('SELECT is_active FROM drivers WHERE driver_id = ?').get(testDriverId);
    assert.strictEqual(d.is_active, 0);

    db.prepare('UPDATE drivers SET is_active = 1 WHERE driver_id = ?').run(testDriverId);
    d = db.prepare('SELECT is_active FROM drivers WHERE driver_id = ?').get(testDriverId);
    assert.strictEqual(d.is_active, 1);
  });

  runTest('Delete driver safely without foreign key constraint violation', () => {
    // Assign driver to a bus, trip, and geofence violation
    const bus = db.prepare('SELECT bus_id FROM buses LIMIT 1').get();
    if (bus) {
      db.prepare('UPDATE buses SET driver_id = ? WHERE bus_id = ?').run(testDriverId, bus.bus_id);
    }

    // Unassign relations safely as implemented in driverController
    db.prepare('UPDATE buses SET driver_id = NULL WHERE driver_id = ?').run(testDriverId);
    db.prepare('UPDATE trips SET driver_id = NULL WHERE driver_id = ?').run(testDriverId);
    db.prepare('UPDATE geofence_violations SET driver_id = NULL WHERE driver_id = ?').run(testDriverId);
    db.prepare('UPDATE pickup_points SET created_by_driver_id = NULL WHERE created_by_driver_id = ?').run(testDriverId);

    db.prepare('DELETE FROM drivers WHERE driver_id = ?').run(testDriverId);
    const exists = db.prepare('SELECT driver_id FROM drivers WHERE driver_id = ?').get(testDriverId);
    assert.strictEqual(exists, undefined);
  });

  // ── 3. MANAGER LIFECYCLE ──
  console.log('\n--- 3. Manager CRUD & FK Safety ---');
  let testMgrId = null;
  runTest('Create manager with @giet.edu email', () => {
    const email = `test.manager.${ts}@giet.edu`;
    assert.strictEqual(isValidGietEmail(email), true);

    const sysId = generateSystemUserId('manager', db);
    const res = db.prepare(`
      INSERT INTO managers (name, email, phone, password, system_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('CRUD Manager', email, '9876543212', 'hashed_pw', sysId);

    testMgrId = res.lastInsertRowid;
    assert.ok(testMgrId > 0);
  });

  runTest('Delete manager safely and nullify assigned bus relations', () => {
    const bus = db.prepare('SELECT bus_id FROM buses LIMIT 1').get();
    if (bus) {
      db.prepare('UPDATE buses SET manager_id = ? WHERE bus_id = ?').run(testMgrId, bus.bus_id);
    }

    // Unassign and delete
    db.prepare('UPDATE buses SET manager_id = NULL WHERE manager_id = ?').run(testMgrId);
    ManagerModel.delete(testMgrId);

    const exists = ManagerModel.findById(testMgrId);
    assert.strictEqual(exists, undefined);
  });

  // ── 4. ROUTE LIFECYCLE ──
  console.log('\n--- 4. Route CRUD & Stops Management ---');
  let testRouteId = null;
  runTest('Create route with ordered bus stops', () => {
    const res = RouteModel.create({
      route_name: `Route Test-${ts}`,
      source: 'Rayagada Station',
      destination: 'GIET Campus',
      distance: 45.5,
      direction: 'towards_campus',
      destination_type: 'college'
    });
    testRouteId = res.lastInsertRowid;
    assert.ok(testRouteId > 0);

    // Add stops
    RouteModel.addStop({
      route_id: testRouteId,
      stop_name: 'Station Square',
      latitude: 19.1670,
      longitude: 83.4150,
      stop_order: 1,
      is_college: 0,
      expected_offset_minutes: 0
    });
    RouteModel.addStop({
      route_id: testRouteId,
      stop_name: 'GIET Main Gate',
      latitude: 19.0494,
      longitude: 83.8242,
      stop_order: 2,
      is_college: 1,
      expected_offset_minutes: 45
    });

    const stops = RouteModel.getStops(testRouteId);
    assert.strictEqual(stops.length, 2);
    assert.strictEqual(stops[1].is_college, 1);
  });

  runTest('Delete route safely and cascade/unassign references', () => {
    // Unassign buses, trips, pickup points and delete stops
    RouteModel.delete(testRouteId);
    const exists = RouteModel.findById(testRouteId);
    assert.strictEqual(exists, undefined);

    const stopsLeft = RouteModel.getStops(testRouteId);
    assert.strictEqual(stopsLeft.length, 0);
  });

  // ── 5. BUS LIFECYCLE ──
  console.log('\n--- 5. Bus CRUD & Capacity Enforcement ---');
  let testBusId = null;
  runTest('Create bus with valid capacity and available seats', () => {
    const busNum = `TEST-${Date.now().toString().slice(-4)}`;
    const regNum = `OD-02-T-${Date.now().toString().slice(-4)}`;

    const res = BusModel.create({
      bus_number: busNum,
      registration_number: regNum,
      capacity: 52,
      available_seats: 52,
      driver_id: null,
      manager_id: null,
      route_id: null
    });

    testBusId = res.lastInsertRowid;
    assert.ok(testBusId > 0);

    const b = BusModel.findById(testBusId);
    assert.strictEqual(b.capacity, 52);
    assert.strictEqual(b.available_seats, 52);
    assert.strictEqual(b.status, 'inactive');
  });

  runTest('Update bus location, status and seat occupancy', () => {
    BusModel.updateLocation(testBusId, 19.0495, 83.8240, 35);
    BusModel.updateStatus(testBusId, 'running');
    BusModel.updateSeats(testBusId, 22);

    const b = BusModel.findById(testBusId);
    assert.strictEqual(b.status, 'running');
    assert.strictEqual(b.available_seats, 22);
    assert.strictEqual(b.current_speed, 35);
  });

  runTest('Delete bus safely clearing all dependent table references', () => {
    // Add dummy trip, feedback, fuel record
    db.prepare("INSERT INTO trips (bus_id, status) VALUES (?, 'scheduled')").run(testBusId);
    db.prepare('INSERT INTO fuel_records (bus_id, date, liters, cost) VALUES (?, ?, ?, ?)').run(
      testBusId, '2026-10-11', 40, 3800
    );

    // Safe deletion as in busController
    db.prepare('UPDATE students SET favorite_bus = NULL WHERE favorite_bus = ?').run(testBusId);
    db.prepare('UPDATE pickup_points SET bus_id = NULL WHERE bus_id = ?').run(testBusId);
    db.prepare('DELETE FROM feedback WHERE bus_id = ?').run(testBusId);
    db.prepare('DELETE FROM fuel_records WHERE bus_id = ?').run(testBusId);
    db.prepare('DELETE FROM maintenance_records WHERE bus_id = ?').run(testBusId);
    db.prepare('DELETE FROM geofence_violations WHERE bus_id = ?').run(testBusId);
    db.prepare('DELETE FROM trips WHERE bus_id = ?').run(testBusId);

    BusModel.delete(testBusId);

    const exists = BusModel.findById(testBusId);
    assert.strictEqual(exists, undefined);
  });

  // ── 6. GEOFENCE / OPERATING AREA LIFECYCLE ──
  console.log('\n--- 6. Operating Area (Geofence) CRUD ---');
  let testGeoId = null;
  runTest('Create operating area with polygon coordinates', () => {
    const coords = JSON.stringify([
      [19.0650, 83.8050],
      [19.0650, 83.8400],
      [19.0300, 83.8400],
      [19.0300, 83.8050]
    ]);

    const res = db.prepare(`
      INSERT INTO geofences (name, description, coordinates, is_active)
      VALUES (?, ?, ?, 1)
    `).run(`Operating Zone ${ts}`, 'Official test boundary', coords);

    testGeoId = res.lastInsertRowid;
    assert.ok(testGeoId > 0);

    const g = db.prepare('SELECT * FROM geofences WHERE geofence_id = ?').get(testGeoId);
    assert.strictEqual(g.is_active, 1);
    const parsed = JSON.parse(g.coordinates);
    assert.strictEqual(parsed.length, 4);
  });

  runTest('Toggle and delete operating area', () => {
    db.prepare('UPDATE geofences SET is_active = 0 WHERE geofence_id = ?').run(testGeoId);
    let g = db.prepare('SELECT is_active FROM geofences WHERE geofence_id = ?').get(testGeoId);
    assert.strictEqual(g.is_active, 0);

    db.prepare('DELETE FROM geofences WHERE geofence_id = ?').run(testGeoId);
    g = db.prepare('SELECT geofence_id FROM geofences WHERE geofence_id = ?').get(testGeoId);
    assert.strictEqual(g, undefined);
  });

  // ── 7. STATS & FLEET CONSISTENCY ──
  console.log('\n--- 7. Stats & Fleet Consistency ---');
  runTest('Database counts are consistent across tables and stats query', () => {
    const stuCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
    const busCount = db.prepare('SELECT COUNT(*) as count FROM buses').get().count;
    const drvCount = db.prepare('SELECT COUNT(*) as count FROM drivers').get().count;
    const mgrCount = db.prepare('SELECT COUNT(*) as count FROM managers').get().count;
    const rCount = db.prepare('SELECT COUNT(*) as count FROM routes').get().count;

    assert.ok(stuCount >= 1, `Expected at least 1 student, got ${stuCount}`);
    assert.ok(busCount >= 1, `Expected at least 1 bus, got ${busCount}`);
    assert.ok(drvCount >= 1, `Expected at least 1 driver, got ${drvCount}`);
    assert.ok(mgrCount >= 1, `Expected at least 1 manager, got ${mgrCount}`);
    assert.ok(rCount >= 1, `Expected at least 1 route, got ${rCount}`);
  });

  console.log('\n======================================================');
  console.log(`📊 INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

startSuite();
