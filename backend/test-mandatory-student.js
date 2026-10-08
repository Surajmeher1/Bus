/**
 * test-mandatory-student.js
 * Executes the EXACT mandatory test specified by the user:
 * Name: Test Student
 * Email: teststudent@giet.edu
 * Role: Student
 * Department: Computer Science
 * Semester: 1
 * Phone: 9876543210
 */
const assert = require('assert');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000/api/v1';

async function runMandatoryTest() {
  console.log('======================================================');
  console.log('🧪 RUNNING MANDATORY USER CREATION TEST');
  console.log('======================================================');

  // 1. Authenticate Admin
  console.log('Step 1: Authenticating Admin...');
  const loginRes = await fetch(`${BASE_URL}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const token = loginData.token;
  console.log('  ✅ Admin authenticated. Token received.');

  // Clean up any previous test student record
  const db = require('./config/db');
  db.prepare("DELETE FROM students WHERE email = 'teststudent@giet.edu'").run();

  // 2. Perform Network Request with the exact requested form data
  console.log('\nStep 2: Submitting User Creation Form payload...');
  const payload = {
    name: 'Test Student',
    email: 'teststudent@giet.edu',
    role: 'student',
    department: 'Computer Science',
    semester: 1,
    phone: '9876543210'
  };
  console.log('  Payload:', JSON.stringify(payload, null, 2));

  const createRes = await fetch(`${BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const createData = await createRes.json();
  console.log(`  Response Status: ${createRes.status}`);
  console.log('  Response Body:', JSON.stringify(createData, null, 2));

  // 3. Verify 2xx response
  assert.strictEqual(createRes.status, 201, `Expected 201, got ${createRes.status}`);
  assert.strictEqual(createData.success, true, 'success should be true');
  assert.strictEqual(createData.message, 'Account created successfully.');
  console.log('  ✅ 1. Network request returned 201 Created');

  // 4. Verify Generated ID exists
  const generatedUserId = createData.user_id;
  assert.ok(generatedUserId, 'user_id must exist in response');
  assert.ok(generatedUserId.startsWith('GIET-STU-'), `user_id must start with GIET-STU-, got ${generatedUserId}`);
  console.log(`  ✅ 2. Generated User ID exists: ${generatedUserId}`);

  // 5. Verify Email status is returned
  assert.ok(createData.email_status, 'email_status must be present');
  console.log(`  ✅ 3. Email status: ${createData.email_status} (${createData.email_message || createData.emailError})`);

  // 6. Verify Database user is created and exists directly in SQLite
  console.log('\nStep 3: Checking Database Record in students table...');
  const studentInDb = db.prepare('SELECT * FROM students WHERE email = ?').get('teststudent@giet.edu');
  assert.ok(studentInDb, 'Student record must exist in database');
  assert.strictEqual(studentInDb.name, 'Test Student');
  assert.strictEqual(studentInDb.email, 'teststudent@giet.edu');
  assert.strictEqual(studentInDb.system_user_id, generatedUserId);
  assert.strictEqual(studentInDb.phone, '9876543210');
  assert.strictEqual(studentInDb.department, 'Computer Science');
  assert.strictEqual(studentInDb.semester, 1);
  assert.strictEqual(studentInDb.must_change_password, 1, 'must_change_password must be 1 (true)');
  console.log('  ✅ 4. Database user created with correct fields and must_change_password=1');

  // 7. Verify Password hash exists and is NOT plaintext
  assert.ok(studentInDb.password, 'Password must exist');
  assert.ok(studentInDb.password.startsWith('$2'), 'Password must be a bcrypt hash (starts with $2)');
  assert.notStrictEqual(studentInDb.password, 'Test Student', 'Password must not be plaintext');
  console.log(`  ✅ 5. Secure bcrypt password hash stored (starts with: ${studentInDb.password.slice(0, 15)}...)`);

  // 8. Verify user appears in admin user list
  console.log('\nStep 4: Checking Admin User List endpoint (GET /admin/users)...');
  const listRes = await fetch(`${BASE_URL}/admin/users?search=teststudent`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const listData = await listRes.json();
  assert.strictEqual(listRes.status, 200);
  const found = (listData.data || []).find(u => u.email === 'teststudent@giet.edu');
  assert.ok(found, 'User must appear in admin user list');
  assert.strictEqual(found.system_user_id, generatedUserId);
  console.log(`  ✅ 6. User appears in Admin User List: ${found.name} (${found.system_user_id})`);

  // 9. Verify created account is usable by the existing login system
  console.log('\nStep 5: Testing Student Login with temporary password...');
  const tempPassword = createData.dev_credentials?.temporary_password || createData.dev_preview?.temporary_password;
  assert.ok(tempPassword, 'Temporary password must be available in development credentials object');

  // Verify bcrypt matches
  const match = await bcrypt.compare(tempPassword, studentInDb.password);
  assert.ok(match, 'Bcrypt compare must succeed for temporary password');

  // Login via API using system_user_id
  const stuLoginRes = await fetch(`${BASE_URL}/auth/student/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: generatedUserId, password: tempPassword })
  });
  const stuLoginData = await stuLoginRes.json();
  assert.strictEqual(stuLoginRes.status, 200, `Student login expected 200, got ${stuLoginRes.status}`);
  assert.strictEqual(stuLoginData.success, true);
  assert.strictEqual(stuLoginData.user.must_change_password, true);
  console.log('  ✅ 7. Student logged in successfully with System User ID & temporary password!');

  console.log('\n======================================================');
  console.log('🎉 MANDATORY TEST PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
}

runMandatoryTest().catch(err => {
  console.error('\n❌ MANDATORY TEST FAILED:', err);
  process.exit(1);
});
