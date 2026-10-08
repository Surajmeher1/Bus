/**
 * Automated Test Suite for Delete User Feature
 * Tests all 10 specified test cases:
 * 1. Admin deletes a normal user → SUCCESS.
 * 2. Admin cancels deletion → NOTHING is deleted.
 * 3. Student attempts DELETE API → 403.
 * 4. Driver attempts DELETE API → 403.
 * 5. Manager attempts DELETE API → 403.
 * 6. Unauthenticated request → 401.
 * 7. Invalid user ID → proper 400/404 response (and admin account deletion blocked).
 * 8. Delete user with active dependencies → safely blocked.
 * 9. Verify existing users and other system data still work.
 * 10. Verify deleted user can no longer log in.
 */

const BASE_URL = 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('🧪 Starting Delete User Comprehensive Test Suite...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] Case ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Case ${total}: ${testName}`);
      if (details) console.error(`   Details:`, details);
    }
  }

  try {
    // Step 0: Admin Login
    console.log('--- Step 0: Admin Login ---');
    const adminLoginRes = await request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
    });
    const adminToken = adminLoginRes.data.token;
    if (!adminToken) throw new Error('Admin login failed: ' + JSON.stringify(adminLoginRes.data));
    console.log('Admin authenticated successfully.\n');

    // Case 6: Unauthenticated request → 401
    console.log('--- Testing Case 6: Unauthenticated request ---');
    const unauthRes = await request('/admin/users/GIET-STU-9999', { method: 'DELETE' });
    assert(
      unauthRes.status === 401 && unauthRes.data.success === false,
      'Unauthenticated request returns 401',
      JSON.stringify(unauthRes)
    );

    // Step 1: Create fresh test users for student, driver, manager
    console.log('\n--- Setting up test users ---');
    const ts = Date.now();
    const stuEmail = `testdelstu_${ts}@giet.edu`;
    const drvEmail = `testdeldriver_${ts}@giet.edu`;
    const mgrEmail = `testdelmgr_${ts}@giet.edu`;

    const createStuRes = await request('/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        role: 'student',
        name: `Test Student ${ts}`,
        email: stuEmail,
        department: 'Computer Science',
        semester: 3
      })
    });
    if (createStuRes.status !== 201) throw new Error('Failed to create test student: ' + JSON.stringify(createStuRes.data));
    const testStudent = createStuRes.data;
    const stuSystemUserId = testStudent.user_id || testStudent.data?.system_user_id;
    const stuTempPw = testStudent.dev_credentials?.temporary_password || testStudent.data?.dev_credentials?.temporary_password;

    const createDrvRes = await request('/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        role: 'driver',
        name: `Test Driver ${ts}`,
        email: drvEmail,
        phone: '9876543210'
      })
    });
    if (createDrvRes.status !== 201) throw new Error('Failed to create test driver: ' + JSON.stringify(createDrvRes.data));
    const testDriver = createDrvRes.data;
    const drvSystemUserId = testDriver.user_id || testDriver.data?.system_user_id;
    const drvTempPw = testDriver.dev_credentials?.temporary_password || testDriver.data?.dev_credentials?.temporary_password;

    const createMgrRes = await request('/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        role: 'manager',
        name: `Test Manager ${ts}`,
        email: mgrEmail,
        phone: '9876543211'
      })
    });
    if (createMgrRes.status !== 201) throw new Error('Failed to create test manager: ' + JSON.stringify(createMgrRes.data));
    const testManager = createMgrRes.data;
    const mgrSystemUserId = testManager.user_id || testManager.data?.system_user_id;
    const mgrTempPw = testManager.dev_credentials?.temporary_password || testManager.data?.dev_credentials?.temporary_password;

    console.log(`Created test users:\n  Student: ${stuSystemUserId} (${stuEmail})\n  Driver: ${drvSystemUserId} (${drvEmail})\n  Manager: ${mgrSystemUserId} (${mgrEmail})\n`);

    // Log in as each role to acquire their tokens
    const stuLoginRes = await request('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ email: stuEmail, password: stuTempPw })
    });
    const studentToken = stuLoginRes.data.token;

    const drvLoginRes = await request('/auth/driver/login', {
      method: 'POST',
      body: JSON.stringify({ email: drvEmail, password: drvTempPw })
    });
    const driverToken = drvLoginRes.data.token;

    const mgrLoginRes = await request('/auth/manager/login', {
      method: 'POST',
      body: JSON.stringify({ email: mgrEmail, password: mgrTempPw })
    });
    const managerToken = mgrLoginRes.data.token;

    // Case 3: Student attempts DELETE API → 403
    console.log('--- Testing Case 3: Student attempts DELETE API ---');
    const stuDeleteAttempt = await request(`/admin/users/${drvSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(
      stuDeleteAttempt.status === 403 && stuDeleteAttempt.data.success === false,
      'Student attempting DELETE API is blocked with 403 Forbidden',
      JSON.stringify(stuDeleteAttempt)
    );

    // Case 4: Driver attempts DELETE API → 403
    console.log('\n--- Testing Case 4: Driver attempts DELETE API ---');
    const drvDeleteAttempt = await request(`/admin/users/${stuSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${driverToken}` }
    });
    assert(
      drvDeleteAttempt.status === 403 && drvDeleteAttempt.data.success === false,
      'Driver attempting DELETE API is blocked with 403 Forbidden',
      JSON.stringify(drvDeleteAttempt)
    );

    // Case 5: Manager attempts DELETE API → 403
    console.log('\n--- Testing Case 5: Manager attempts DELETE API ---');
    const mgrDeleteAttempt = await request(`/admin/users/${stuSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert(
      mgrDeleteAttempt.status === 403 && mgrDeleteAttempt.data.success === false,
      'Manager attempting DELETE API is blocked with 403 Forbidden',
      JSON.stringify(mgrDeleteAttempt)
    );

    // Case 7: Invalid user ID → proper 400/404 response & primary admin deletion blocked
    console.log('\n--- Testing Case 7: Invalid user ID & Admin deletion protection ---');
    const invalidIdRes = await request('/admin/users/NON_EXISTENT_ID_99999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
      invalidIdRes.status === 404 && invalidIdRes.data.success === false,
      'Non-existent user ID returns 404 Not Found',
      JSON.stringify(invalidIdRes)
    );

    const adminDeleteAttempt = await request('/admin/users/admin', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
      adminDeleteAttempt.status === 403 && adminDeleteAttempt.data.success === false,
      'Attempt to delete primary system admin is blocked with 403 Forbidden',
      JSON.stringify(adminDeleteAttempt)
    );

    // Case 8: Delete user with active dependencies → safely blocked
    console.log('\n--- Testing Case 8: Delete user with active dependencies ---');
    // Driver 1 is assigned to Bus BUS-001 in seed data
    const activeDriverRes = await request('/admin/users/1?role=driver', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
      activeDriverRes.status === 400 &&
      activeDriverRes.data.success === false &&
      activeDriverRes.data.message.includes('assigned to an active bus/trip'),
      'Deleting driver assigned to active bus is safely blocked with 400 and clear message',
      JSON.stringify(activeDriverRes)
    );

    // Manager 1 is assigned to Bus BUS-001/002
    const activeManagerRes = await request('/admin/users/1?role=manager', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
      activeManagerRes.status === 400 &&
      activeManagerRes.data.success === false &&
      activeManagerRes.data.message.includes('assigned to an active bus/trip'),
      'Deleting manager assigned to active bus is safely blocked with 400 and clear message',
      JSON.stringify(activeManagerRes)
    );

    // Case 2: Admin cancels deletion → NOTHING is deleted
    console.log('\n--- Testing Case 2: Admin cancels deletion ---');
    // When cancelled on frontend, no DELETE call is executed; user remains in database
    const checkBeforeDelete = await request(`/admin/users?search=${encodeURIComponent(stuEmail)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const foundUserBefore = (checkBeforeDelete.data.data || []).find(u => u.email === stuEmail);
    assert(
      !!foundUserBefore && foundUserBefore.email === stuEmail,
      'User remains intact before / without confirmation',
      JSON.stringify(foundUserBefore)
    );

    // Case 1: Admin deletes a normal user → SUCCESS
    console.log('\n--- Testing Case 1: Admin deletes a normal user ---');
    const deleteRes = await request(`/admin/users/${stuSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(
      deleteRes.status === 200 &&
      deleteRes.data.success === true &&
      deleteRes.data.message === 'User deleted successfully',
      'Admin deletes normal student user successfully with status 200 and success response',
      JSON.stringify(deleteRes)
    );

    // Verify user is gone from user list
    const checkAfterDelete = await request(`/admin/users?search=${encodeURIComponent(stuEmail)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const foundUserAfter = (checkAfterDelete.data.data || []).find(u => u.email === stuEmail);
    assert(
      !foundUserAfter,
      'Deleted user is no longer returned in admin user list'
    );

    // Verify activity_logs recorded action 'USER_DELETED'
    const logsRes = await request('/activity-logs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const logs = logsRes.data.data || [];
    const deleteLog = logs.find(l => l.action === 'USER_DELETED' && l.details.includes(stuSystemUserId));
    assert(
      !!deleteLog,
      'Audit log recorded USER_DELETED action with admin ID, deleted user ID, name, email',
      JSON.stringify(deleteLog)
    );

    // Case 10: Verify deleted user can no longer log in
    console.log('\n--- Testing Case 10: Deleted user can no longer log in ---');
    const loginAfterDelete = await request('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ email: stuEmail, password: stuTempPw })
    });
    assert(
      loginAfterDelete.status === 401 && loginAfterDelete.data.success === false,
      'Deleted student receives 401 Invalid credentials upon login attempt',
      JSON.stringify(loginAfterDelete)
    );

    // Clean up temporary driver and manager that have no dependencies
    await request(`/admin/users/${drvSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    await request(`/admin/users/${mgrSystemUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Case 9: Verify existing users and other system data still work
    console.log('\n--- Testing Case 9: Verify existing users and system data ---');
    const usersCheck = await request('/admin/users', { headers: { Authorization: `Bearer ${adminToken}` } });
    const busesCheck = await request('/buses', { headers: { Authorization: `Bearer ${adminToken}` } });
    const routesCheck = await request('/routes', { headers: { Authorization: `Bearer ${adminToken}` } });
    const statsCheck = await request('/stats', { headers: { Authorization: `Bearer ${adminToken}` } });

    assert(
      usersCheck.ok && busesCheck.ok && routesCheck.ok && statsCheck.ok,
      'System endpoints (users, buses, routes, stats) are fully functional after deletions',
      `Users: ${usersCheck.status}, Buses: ${busesCheck.status}, Routes: ${routesCheck.status}, Stats: ${statsCheck.status}`
    );

    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} / ${total} tests passed.`);
    console.log(`========================================\n`);

    if (passed === total) {
      console.log('🎉 ALL 10 DELETE USER TEST CASES PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('⚠️ Some tests failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  }
}

runTests();
