/**
 * test-user-creation-scenarios.js
 * Comprehensive automated verification for all 8 user creation test requirements
 */
const assert = require('assert');

async function runScenarioTests() {
  const BASE_URL = 'http://localhost:5000/api/v1';

  console.log('\n======================================================');
  console.log('🧪 RUNNING ALL 8 USER CREATION SCENARIOS');
  console.log('======================================================\n');

  // Step 0: Admin Login
  const adminLoginRes = await fetch(`${BASE_URL}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
  });
  const adminLoginData = await adminLoginRes.json();
  assert.strictEqual(adminLoginRes.status, 200, 'Admin login failed');
  const adminToken = adminLoginData.token;
  console.log('🔑 Admin authenticated successfully.');

  let passed = 0;
  let failed = 0;

  async function check(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${desc} -> ${e.message}`);
      failed++;
    }
  }

  // Helper
  async function postUser(body, token = adminToken, extraHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  // TEST 1: student@gmail.com -> REJECTED
  await check('TEST 1: student@gmail.com rejected with 400', async () => {
    const res = await postUser({ role: 'student', name: 'Test Gmail', email: 'student@gmail.com' });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /@giet\.edu/);
  });

  // TEST 2: student@giet.edu.in -> REJECTED
  await check('TEST 2: student@giet.edu.in rejected with 400', async () => {
    const res = await postUser({ role: 'student', name: 'Test Edu In', email: 'student@giet.edu.in' });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /@giet\.edu/);
  });

  // TEST 3: student@giet.edu -> ACCEPTED
  const test3Email = `student.test3.${Date.now()}@giet.edu`;
  let test3UserId = '';
  await check('TEST 3: student@giet.edu accepted with 201 and User ID generated', async () => {
    const res = await postUser({
      role: 'student',
      name: 'Test GIET Student',
      email: test3Email,
      roll_number: '23CSE' + Math.floor(1000 + Math.random() * 9000),
      semester: '4',
      department: 'Computer Science',
      phone: '9876543210'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.message, 'Account created successfully.');
    assert.ok(res.data.user_id && res.data.user_id.startsWith('GIET-STU-'), `Invalid user_id: ${res.data.user_id}`);
    test3UserId = res.data.user_id;
  });

  // TEST 4: existing@giet.edu -> DUPLICATE EMAIL ERROR
  await check('TEST 4: duplicate email returns 409 Conflict', async () => {
    const res = await postUser({
      role: 'student',
      name: 'Duplicate Student',
      email: test3Email
    });
    assert.strictEqual(res.status, 409, `Expected 409, got ${res.status}`);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /already registered/);
  });

  // TEST 5: valid new @giet.edu account -> ACCOUNT CREATED
  const test5Email = `student.test5.${Date.now()}@giet.edu`;
  await check('TEST 5: valid new @giet.edu account created without roll number (auto-assigned)', async () => {
    const res = await postUser({
      role: 'student',
      name: 'Auto Roll Student',
      email: test5Email
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.message, 'Account created successfully.');
    assert.ok(res.data.user_id.startsWith('GIET-STU-'));
  });

  // TEST 6: valid account + SMTP configured -> EMAIL SENT
  await check('TEST 6: valid account with SMTP configured returns email_status = sent', async () => {
    const test6Email = `student.test6.${Date.now()}@giet.edu`;
    const res = await postUser({
      role: 'student',
      name: 'SMTP Success Student',
      email: test6Email
    }, adminToken, { 'x-simulate-smtp-configured': 'true' });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.email_status, 'sent');
    assert.strictEqual(res.data.email_message, "Login credentials have been sent to the user's GIET email.");
  });

  // TEST 7: valid account + SMTP unavailable -> ACCOUNT CREATION SHOULD NOT CORRUPT OR CRASH
  await check('TEST 7: valid account with SMTP unavailable returns 201 and does NOT crash', async () => {
    const test7Email = `student.test7.${Date.now()}@giet.edu`;
    const res = await postUser({
      role: 'student',
      name: 'SMTP Unavailable Student',
      email: test7Email
    }, adminToken, { 'x-simulate-smtp-unconfigured': 'true' });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.message, 'Account created successfully.');
    assert.strictEqual(res.data.email_status, 'failed');
    assert.strictEqual(res.data.email_message, 'Account created, but email could not be sent. Check SMTP configuration.');
    assert.ok(res.data.user_id.startsWith('GIET-STU-'));
  });

  // TEST 8: non-admin calls API -> Expected: 401/403
  await check('TEST 8: unauthenticated request returns 401 Unauthorized', async () => {
    const res = await postUser({ role: 'student', name: 'Unauthorized', email: 'unauth@giet.edu' }, null);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  await check('TEST 8: student token calling admin endpoint returns 403 Forbidden', async () => {
    // Generate valid student token (using existing seeded student id: 1)
    const jwt = require('jsonwebtoken');
    const jwtConfig = require('./config/jwt');
    const studentToken = jwt.sign({ id: 1, role: 'student', username: 'student' }, jwtConfig.secret, { expiresIn: '1h' });

    const res = await postUser({ role: 'student', name: 'Student Trying Admin API', email: 'student.hacker@giet.edu' }, studentToken);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /(Access denied|permission)/i);
  });

  console.log('\n======================================================');
  console.log(`📊 SCENARIOS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runScenarioTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
