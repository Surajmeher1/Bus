/**
 * End-to-End API Test Suite for GIET Smart University Bus Tracking System
 * Tests actual HTTP REST endpoints against the Express server
 */

const assert = require('assert');
const http = require('http');

let passed = 0;
let failed = 0;

function it(name, fn) {
  return fn()
    .then(() => {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    });
}

async function runE2ETests() {
  // Start server on a dedicated test port (5099)
  process.env.PORT = '5099';
  process.env.JWT_SECRET = 'test_secret_giet_bus_2026';
  process.env.ENABLE_GPS_SIMULATION = 'false';

  require('./server');
  // Wait 600ms for server to boot
  await new Promise((resolve) => setTimeout(resolve, 600));

  console.log('\n======================================================');
  console.log('🌐 RUNNING END-TO-END REST API TEST SUITE (PORT 5099)');
  console.log('======================================================\n');

  const BASE_URL = 'http://localhost:5099/api/v1';

  let adminToken = '';
  let createdStudentUserId = '';
  let createdStudentTempPw = '';
  let createdStudentEmail = '';
  let createdDriverUserId = '';
  let studentToken = '';

  try {
    // 1. Admin Login
    await it('Admin logs in with default credentials', async () => {
      const res = await fetch(`${BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.token, 'Token must be returned');
      adminToken = data.token;
    });

    // 2. Reject User Creation with Non-@giet.edu Domain
    await it('Reject user creation with non-@giet.edu email (e.g. gmail.com)', async () => {
      const res = await fetch(`${BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          role: 'student',
          name: 'Unauthorized Domain User',
          email: 'student@gmail.com',
          roll_number: '23CSE999'
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
      assert.match(data.message, /@giet\.edu/i, 'Error message must specify @giet.edu domain rule');
    });

    // 3. Reject other invalid domains (e.g. @giet.edu.in, @giet.ac.in)
    await it('Reject user creation with @giet.edu.in / @giet.ac.in domains', async () => {
      const res1 = await fetch(`${BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          role: 'student',
          name: 'Subdomain User',
          email: 'test@giet.edu.in'
        })
      });
      assert.strictEqual(res1.status, 400);

      const res2 = await fetch(`${BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          role: 'student',
          name: 'AC Domain User',
          email: 'test@giet.ac.in'
        })
      });
      assert.strictEqual(res2.status, 400);
    });

    // 4. Admin Creates Valid Student
    await it('Admin creates Student with @giet.edu email -> Auto generates User ID & Temp PW', async () => {
      createdStudentEmail = `23cse${Math.floor(100 + Math.random() * 900)}@giet.edu`;
      const res = await fetch(`${BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          role: 'student',
          name: 'Suresh Kumar',
          email: createdStudentEmail,
          roll_number: `23CSE${Math.floor(1000 + Math.random() * 9000)}`,
          department: 'Computer Science',
          semester: 4
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.user_id.startsWith('GIET-STU-'), `Expected GIET-STU- ID, got ${data.user_id}`);
      assert.ok(data.dev_credentials, 'Development credentials object must be returned');
      assert.ok(data.dev_credentials.temporary_password, 'Temporary password must be generated');

      createdStudentUserId = data.user_id;
      createdStudentTempPw = data.dev_credentials.temporary_password;
    });

    // 5. Admin Creates Valid Driver
    await it('Admin creates Driver with @giet.edu email -> Auto generates GIET-DRV- ID', async () => {
      const driverEmail = `driver.${Date.now()}@giet.edu`;
      const res = await fetch(`${BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          role: 'driver',
          name: 'Ramesh Pradhan',
          email: driverEmail,
          phone: '9876543210',
          license_number: `OD-02-${Date.now()}`
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.user_id.startsWith('GIET-DRV-'), `Expected GIET-DRV- ID, got ${data.user_id}`);
      createdDriverUserId = data.user_id;
    });

    // 6. Student Login with Temp Password & must_change_password enforcement
    await it('Student logs in with System User ID & temp password -> must_change_password is true', async () => {
      const res = await fetch(`${BASE_URL}/auth/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createdStudentUserId, // test login by system_user_id
          password: createdStudentTempPw
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert.strictEqual(data.user.must_change_password, true, 'must_change_password must be true');
      studentToken = data.token;
    });

    // 7. Student Changes Temporary Password
    const newPermanentPw = 'StudentSecure@2026';
    await it('Student changes temporary password -> clears must_change_password flag', async () => {
      const res = await fetch(`${BASE_URL}/auth/change-temp-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          current_password: createdStudentTempPw,
          new_password: newPermanentPw
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert.strictEqual(data.success, true);
    });

    // 8. Student Login with New Permanent Password
    await it('Student logs in with updated password -> must_change_password is now false', async () => {
      const res = await fetch(`${BASE_URL}/auth/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createdStudentEmail, // test login by institutional email
          password: newPermanentPw
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.user.must_change_password, false, 'must_change_password must be false now');
    });

    // 9. Geofence Operating Area Endpoints
    let createdGeofenceId = null;
    await it('Admin manages Bus Operating Area (CRUD & Toggle)', async () => {
      // Create geofence
      const createRes = await fetch(`${BASE_URL}/geofences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Test Transit Corridor',
          description: 'Special route corridor',
          coordinates: [
            [19.060, 83.810],
            [19.060, 83.830],
            [19.040, 83.830],
            [19.040, 83.810]
          ],
          color: '#3b82f6',
          is_active: 1
        })
      });
      const createData = await createRes.json();
      assert.strictEqual(createRes.status, 201);
      createdGeofenceId = createData.geofence_id;

      // Toggle geofence
      const toggleRes = await fetch(`${BASE_URL}/geofences/${createdGeofenceId}/toggle`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const toggleData = await toggleRes.json();
      assert.strictEqual(toggleRes.status, 200);
      assert.strictEqual(toggleData.is_active, 0);

      // Get violations
      const violRes = await fetch(`${BASE_URL}/geofences/violations`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(violRes.status, 200);
    });

    // 10. Route Management: Stops & Destination
    await it('Admin adds stop with campus destination flag and reorders stops', async () => {
      // Get all routes
      const routesRes = await fetch(`${BASE_URL}/routes`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const routesData = await routesRes.json();
      assert.strictEqual(routesRes.status, 200);
      const routeId = routesData.data[0].route_id;

      // Add stop
      const addStopRes = await fetch(`${BASE_URL}/routes/${routeId}/stops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          stop_name: 'GIET Main Auditorium',
          latitude: 19.0498,
          longitude: 83.8245,
          stop_order: 99,
          expected_offset_minutes: 25,
          is_college: 1
        })
      });
      assert.strictEqual(addStopRes.status, 201);

      // Reorder stops
      const reorderRes = await fetch(`${BASE_URL}/routes/${routeId}/stops/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          stops: [
            { stop_id: 1, stop_order: 1 },
            { stop_id: 2, stop_order: 2 }
          ]
        })
      });
      assert.strictEqual(reorderRes.status, 200);
    });

  } catch (err) {
    console.error('Test suite error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`📊 E2E API RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runE2ETests().catch(err => {
  console.error('Fatal E2E test error:', err);
  process.exit(1);
});
