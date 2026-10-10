/**
 * userManagementController.js
 * Admin User Management: creation of Students, Drivers, Managers with strict @giet.edu validation,
 * automatic system User ID generation, secure temporary passwords, email dispatch, and first-login password changes.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { isValidGietEmail, generateSystemUserId, generateTempPassword } = require('../utils/validation');
const emailService = require('../services/emailService');
const { ROLES, normalizeRole } = require('../utils/roles');

/**
 * GET /api/v1/admin/users
 * Returns unified list of all users across roles (Student, Driver, Manager)
 */
const getAllUsers = (req, res) => {
  try {
    const { role, search } = req.query;

    const students = db.prepare(`
      SELECT student_id as id, system_user_id, name, email, roll_number as identifier,
             phone, department, '${ROLES.STUDENT}' as role, 1 as is_active,
             must_change_password, created_at
      FROM students
    `).all();

    const drivers = db.prepare(`
      SELECT driver_id as id, system_user_id, name, email, license_number as identifier,
             phone, '' as department, '${ROLES.DRIVER}' as role, is_active,
             must_change_password, created_at
      FROM drivers
    `).all();

    const managers = db.prepare(`
      SELECT manager_id as id, system_user_id, name, email, '' as identifier,
             phone, '' as department, '${ROLES.MANAGER}' as role, 1 as is_active,
             must_change_password, created_at
      FROM managers
    `).all();

    let all = [...students, ...drivers, ...managers];

    if (role && role !== 'all') {
      const searchRole = normalizeRole(role);
      all = all.filter(u => normalizeRole(u.role) === searchRole);
    }


    if (search) {
      const q = search.toLowerCase();
      all = all.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.system_user_id && u.system_user_id.toLowerCase().includes(q)) ||
        (u.identifier && u.identifier.toLowerCase().includes(q))
      );
    }

    // Sort by created_at descending
    all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json({ success: true, data: all, total: all.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/v1/admin/users
 * Admin creates a new user (Student, Driver, or Manager)
 */
const createUser = async (req, res) => {
  console.log('[USER CREATE] controller reached');
  try {
    const role = req.body.role;
    const name = req.body.name || req.body.fullName;
    const email = req.body.email;
    const phone = req.body.phone;
    const roll_number = req.body.roll_number || req.body.rollNumber;
    const department = req.body.department;
    const semester = req.body.semester;
    const license_number = req.body.license_number || req.body.licenseNumber;
    const address = req.body.address;

    // 1. Mandatory role validation (Only STUDENT, DRIVER, MANAGER allowed. Normal users/admins cannot create ADMIN accounts)
    const normalizedTargetRole = normalizeRole(role);
    const validRoles = [ROLES.STUDENT, ROLES.DRIVER, ROLES.MANAGER];
    if (!role || !validRoles.includes(normalizedTargetRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Role must be one of: STUDENT, DRIVER, MANAGER.'
      });
    }


    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    // 2. Strict @giet.edu Email Validation
    if (!email || !isValidGietEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email domain. Only emails ending strictly with @giet.edu are allowed (e.g., student123@giet.edu, driver01@giet.edu).'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Unique email check across all user tables
    const inStudents = db.prepare('SELECT 1 FROM students WHERE email = ?').get(cleanEmail);
    const inDrivers  = db.prepare('SELECT 1 FROM drivers WHERE email = ?').get(cleanEmail);
    const inManagers = db.prepare('SELECT 1 FROM managers WHERE email = ?').get(cleanEmail);
    const inAdmins   = db.prepare('SELECT 1 FROM admins WHERE email = ?').get(cleanEmail);

    if (inStudents || inDrivers || inManagers || inAdmins) {
      return res.status(409).json({
        success: false,
        message: `The email '${cleanEmail}' is already registered in the system.`
      });
    }

    console.log('[USER CREATE] validation passed');

    // 4. Automatically generate unique system User ID
    const systemUserId = generateSystemUserId(role.toLowerCase(), db);

    // 5. Automatically generate secure temporary password
    const tempPassword = generateTempPassword();

    // 6. Bcrypt hash the temporary password (never store plaintext)
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let insertedId = null;

    console.log('[USER CREATE] database insert started');

    // 7. Insert into appropriate role table
    if (role.toLowerCase() === 'student') {
      const roll = roll_number ? roll_number.trim() : systemUserId;
      // Check duplicate roll number
      const existingRoll = db.prepare('SELECT 1 FROM students WHERE roll_number = ?').get(roll);
      if (existingRoll) {
        return res.status(409).json({
          success: false,
          message: `Student roll number '${roll}' already exists.`
        });
      }

      const stmt = db.prepare(`
        INSERT INTO students (
          system_user_id, roll_number, name, email, phone, department, semester,
          password, must_change_password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const result = stmt.run(
        systemUserId,
        roll,
        name.trim(),
        cleanEmail,
        phone || null,
        department || 'General Engineering',
        semester ? parseInt(semester) : 1,
        hashedPassword
      );
      insertedId = result.lastInsertRowid;
    } else if (role.toLowerCase() === 'driver') {
      const lic = license_number ? license_number.trim() : null;
      if (lic) {
        const existingLic = db.prepare('SELECT 1 FROM drivers WHERE license_number = ?').get(lic);
        if (existingLic) {
          return res.status(409).json({
            success: false,
            message: `License number '${lic}' is already registered.`
          });
        }
      }

      const stmt = db.prepare(`
        INSERT INTO drivers (
          system_user_id, name, email, password, phone, license_number, address,
          is_active, must_change_password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
      `);
      const result = stmt.run(
        systemUserId,
        name.trim(),
        cleanEmail,
        hashedPassword,
        phone || null,
        lic,
        address || 'Gunupur'
      );
      insertedId = result.lastInsertRowid;
    } else if (role.toLowerCase() === 'manager') {
      const stmt = db.prepare(`
        INSERT INTO managers (
          system_user_id, name, email, phone, password, must_change_password
        ) VALUES (?, ?, ?, ?, ?, 1)
      `);
      const result = stmt.run(
        systemUserId,
        name.trim(),
        cleanEmail,
        phone || null,
        hashedPassword
      );
      insertedId = result.lastInsertRowid;
    }

    req.logActivity?.('USER_CREATED', `Admin created ${normalizedTargetRole} ${name} (${cleanEmail}) [ID: ${systemUserId}]`);


    const simulateConfigured = (req.headers['x-simulate-smtp-configured'] === 'true' || req.headers['x-test-smtp'] === 'configured') && process.env.NODE_ENV !== 'production';
    const simulateUnconfigured = (req.headers['x-simulate-smtp-unconfigured'] === 'true' || req.headers['x-test-smtp'] === 'unconfigured') && process.env.NODE_ENV !== 'production';

    // 8. Send credentials via email service
    const emailResult = await emailService.sendAccountCredentials({
      to: cleanEmail,
      userId: systemUserId,
      tempPassword,
      role: role.toLowerCase(),
      name: name.trim(),
      simulateConfigured,
      simulateUnconfigured
    });

    console.log('[USER CREATE] emailResult:', emailResult);
    const emailSent = !!emailResult.sent;
    const emailStatus = emailSent ? 'sent' : 'failed';
    const emailMessage = emailSent
      ? "Login credentials have been sent to the user's GIET email."
      : "Account created, but email could not be sent. Check SMTP configuration.";

    const userObj = {
      system_user_id: systemUserId,
      user_id: systemUserId,
      id: insertedId,
      name: name.trim(),
      email: cleanEmail,
      role: role.toLowerCase(),
      phone: phone || null
    };

    const devCredentialsObj = {
      system_user_id: systemUserId,
      temporary_password: tempPassword,
      userId: systemUserId,
      tempPassword: tempPassword,
      role: role.toLowerCase(),
      email: cleanEmail
    };

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user_id: systemUserId,
      user: userObj,
      record_id: insertedId,
      email: cleanEmail,
      name: name.trim(),
      role: role.toLowerCase(),
      email_status: emailStatus,
      email_message: emailMessage,
      emailSent,
      emailError: emailResult.reason || (emailSent ? null : 'SMTP not configured'),
      ...(process.env.NODE_ENV === 'production' ? {} : {
        dev_credentials: devCredentialsObj,
        devCredentials: emailResult.devCredentials || devCredentialsObj,
        dev_preview: devCredentialsObj
      }),
      data: {
        system_user_id: systemUserId,
        user_id: systemUserId,
        email: cleanEmail,
        name: name.trim(),
        role: role.toLowerCase(),
        email_status: emailStatus,
        email_message: emailMessage,
        emailSent,
        emailError: emailResult.reason || null,
        ...(process.env.NODE_ENV === 'production' ? {} : {
          dev_credentials: devCredentialsObj,
          devCredentials: devCredentialsObj,
          dev_preview: devCredentialsObj
        })
      }
    });
  } catch (err) {
    console.error('❌ User creation error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message, error: err.message });
  }
};

/**
 * POST /api/v1/auth/change-temp-password
 * Enforces first-login temporary password change
 */
const changeTempPassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current temporary password and new password are required.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    const { id, role } = req.user;
    const normalizedRole = normalizeRole(role);
    let userRecord = null;
    let table = '';
    let idCol = '';

    if (normalizedRole === ROLES.STUDENT) {
      table = 'students';
      idCol = 'student_id';
    } else if (normalizedRole === ROLES.DRIVER) {
      table = 'drivers';
      idCol = 'driver_id';
    } else if (normalizedRole === ROLES.MANAGER) {
      table = 'managers';
      idCol = 'manager_id';
    } else if (normalizedRole === ROLES.ADMIN) {
      table = 'admins';
      idCol = 'admin_id';
    } else {
      return res.status(400).json({ success: false, message: 'Unknown role.' });
    }

    userRecord = db.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(id);
    if (!userRecord) {
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }

    const valid = await bcrypt.compare(current_password, userRecord.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current temporary password is incorrect.' });
    }

    const hashedNew = await bcrypt.hash(new_password, 10);
    db.prepare(`UPDATE ${table} SET password = ?, must_change_password = 0 WHERE ${idCol} = ?`).run(hashedNew, id);

    req.logActivity?.('change_temp_password', `User ${userRecord.email || userRecord.username} updated initial temporary password`);

    res.json({
      success: true,
      message: 'Password successfully changed. You can now access your dashboard normally.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/v1/admin/users/:id
 * Secure admin-only endpoint to delete a user (Student, Driver, Manager)
 * Verifies JWT authentication & admin role.
 * Validates dependencies before deletion:
 * - Prevents deleting primary system admin accounts
 * - Blocks deletion if user is assigned to an active bus or running/scheduled trip
 * - Preserves historical logs, completed trips, geofence violations, and pickup points
 * - Records action 'USER_DELETED' in activity_logs
 */
const deleteUser = (req, res) => {
  try {
    // 1. Double check admin role
    if (!req.user || normalizeRole(req.user.role) !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Required role(s): ADMIN.'
      });
    }

    const idParam = req.params.id;
    if (!idParam || !idParam.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required.'
      });
    }

    const cleanId = idParam.trim();
    let targetUser = null;

    // Security: Check if targeting primary system administrator account (ID 1, 'admin', or admin role)
    const roleHint = (req.query.role || req.body?.role || '').toLowerCase();
    const isAdminTarget = cleanId.toLowerCase() === 'admin' ||
                          cleanId.toLowerCase() === 'admin@university.edu' ||
                          (roleHint === 'admin') ||
                          (!roleHint && cleanId === '1');
    if (isAdminTarget) {
      const adminAcc = db.prepare(`SELECT admin_id as id, system_user_id, username as name, email, 'admin' as role FROM admins WHERE admin_id = ? OR username = ? OR email = ?`).get(cleanId, cleanId, cleanId);
      if (adminAcc || cleanId.toLowerCase() === 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Primary system administrator accounts cannot be deleted.'
        });
      }
    }

    // 2. Resolve user by system_user_id (e.g. GIET-STU-XXXX, GIET-DRV-XXXX, GIET-MGR-XXXX, GIET-ADM-XXXX)
    targetUser = db.prepare(`SELECT student_id as id, system_user_id, name, email, 'student' as role FROM students WHERE system_user_id = ?`).get(cleanId);
    if (!targetUser) {
      targetUser = db.prepare(`SELECT driver_id as id, system_user_id, name, email, 'driver' as role FROM drivers WHERE system_user_id = ?`).get(cleanId);
    }
    if (!targetUser) {
      targetUser = db.prepare(`SELECT manager_id as id, system_user_id, name, email, 'manager' as role FROM managers WHERE system_user_id = ?`).get(cleanId);
    }
    if (!targetUser) {
      targetUser = db.prepare(`SELECT admin_id as id, system_user_id, username as name, email, 'admin' as role FROM admins WHERE system_user_id = ?`).get(cleanId);
    }

    // 3. Resolve user by numeric primary key if not found by system_user_id
    const numId = parseInt(cleanId, 10);
    if (!targetUser && !isNaN(numId) && numId > 0 && String(numId) === cleanId) {
      const roleHint = req.query.role || req.body?.role;
      if (roleHint === 'student') {
        targetUser = db.prepare(`SELECT student_id as id, system_user_id, name, email, 'student' as role FROM students WHERE student_id = ?`).get(numId);
      } else if (roleHint === 'driver') {
        targetUser = db.prepare(`SELECT driver_id as id, system_user_id, name, email, 'driver' as role FROM drivers WHERE driver_id = ?`).get(numId);
      } else if (roleHint === 'manager') {
        targetUser = db.prepare(`SELECT manager_id as id, system_user_id, name, email, 'manager' as role FROM managers WHERE manager_id = ?`).get(numId);
      } else if (roleHint === 'admin') {
        targetUser = db.prepare(`SELECT admin_id as id, system_user_id, username as name, email, 'admin' as role FROM admins WHERE admin_id = ?`).get(numId);
      }

      if (!targetUser) {
        targetUser = db.prepare(`SELECT student_id as id, system_user_id, name, email, 'student' as role FROM students WHERE student_id = ?`).get(numId);
        if (!targetUser) {
          targetUser = db.prepare(`SELECT driver_id as id, system_user_id, name, email, 'driver' as role FROM drivers WHERE driver_id = ?`).get(numId);
        }
        if (!targetUser) {
          targetUser = db.prepare(`SELECT manager_id as id, system_user_id, name, email, 'manager' as role FROM managers WHERE manager_id = ?`).get(numId);
        }
        if (!targetUser) {
          targetUser = db.prepare(`SELECT admin_id as id, system_user_id, username as name, email, 'admin' as role FROM admins WHERE admin_id = ?`).get(numId);
        }
      }
    }

    // 4. Resolve user by email or roll/license identifier as fallback
    if (!targetUser) {
      targetUser = db.prepare(`SELECT student_id as id, system_user_id, name, email, 'student' as role FROM students WHERE email = ? OR roll_number = ?`).get(cleanId, cleanId);
      if (!targetUser) {
        targetUser = db.prepare(`SELECT driver_id as id, system_user_id, name, email, 'driver' as role FROM drivers WHERE email = ? OR license_number = ?`).get(cleanId, cleanId);
      }
      if (!targetUser) {
        targetUser = db.prepare(`SELECT manager_id as id, system_user_id, name, email, 'manager' as role FROM managers WHERE email = ?`).get(cleanId);
      }
      if (!targetUser) {
        targetUser = db.prepare(`SELECT admin_id as id, system_user_id, username as name, email, 'admin' as role FROM admins WHERE email = ? OR username = ?`).get(cleanId, cleanId);
      }
    }

    // 5. If user not found, return 404
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `User '${cleanId}' not found.`
      });
    }

    // 6. Security: Prevent deleting primary/system admin account
    if (normalizeRole(targetUser.role) === ROLES.ADMIN || targetUser.name === 'admin' || targetUser.username === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Primary system administrator accounts cannot be deleted.'
      });
    }


    // 7. Database Safety: Check active dependencies
    if (targetUser.role === 'driver') {
      // Check active bus assignment
      const assignedBus = db.prepare('SELECT bus_id, bus_number FROM buses WHERE driver_id = ?').get(targetUser.id);
      if (assignedBus) {
        return res.status(400).json({
          success: false,
          message: `User cannot be deleted because they are currently assigned to an active bus/trip. Reassign them first. (Assigned to Bus ${assignedBus.bus_number})`
        });
      }

      // Check active trip assignment (running or scheduled)
      const activeTrip = db.prepare("SELECT trip_id, status FROM trips WHERE driver_id = ? AND status IN ('running', 'scheduled')").get(targetUser.id);
      if (activeTrip) {
        return res.status(400).json({
          success: false,
          message: `User cannot be deleted because they are currently assigned to an active bus/trip. Reassign them first. (${activeTrip.status.toUpperCase()} Trip #${activeTrip.trip_id})`
        });
      }

      // Preserve historical trip records, violations, and pickup points safely
      db.prepare('UPDATE trips SET driver_id = NULL WHERE driver_id = ?').run(targetUser.id);
      db.prepare('UPDATE geofence_violations SET driver_id = NULL WHERE driver_id = ?').run(targetUser.id);
      db.prepare('UPDATE pickup_points SET created_by_driver_id = NULL WHERE created_by_driver_id = ?').run(targetUser.id);

      // Delete driver record
      db.prepare('DELETE FROM drivers WHERE driver_id = ?').run(targetUser.id);
    } else if (targetUser.role === 'manager') {
      // Check active bus assignment
      const assignedBus = db.prepare('SELECT bus_id, bus_number FROM buses WHERE manager_id = ?').get(targetUser.id);
      if (assignedBus) {
        return res.status(400).json({
          success: false,
          message: `User cannot be deleted because they are currently assigned to an active bus/trip. Reassign them first. (Manager of Bus ${assignedBus.bus_number})`
        });
      }

      // Delete manager record
      db.prepare('DELETE FROM managers WHERE manager_id = ?').run(targetUser.id);
    } else if (targetUser.role === 'student') {
      // Clean up student's feedback records to prevent foreign key errors while keeping all other data intact
      db.prepare('DELETE FROM feedback WHERE student_id = ?').run(targetUser.id);

      // Delete student record
      db.prepare('DELETE FROM students WHERE student_id = ?').run(targetUser.id);
    }

    // 8. Audit Logging
    const adminIdentifier = req.user.username || req.user.email || `Admin#${req.user.id}`;
    const logDetails = `Admin ${adminIdentifier} deleted ${targetUser.role} ${targetUser.name} (${targetUser.email}) [ID: ${targetUser.system_user_id || targetUser.id}]`;
    try {
      if (typeof req.logActivity === 'function') {
        req.logActivity('USER_DELETED', logDetails);
      } else {
        db.prepare(`
          INSERT INTO activity_logs (user_type, user_id, action, details, ip_address)
          VALUES (?, ?, ?, ?, ?)
        `).run('admin', req.user?.id || null, 'USER_DELETED', logDetails, req.ip || 'unknown');
      }
    } catch (logErr) {
      console.warn('⚠️ Could not log USER_DELETED activity:', logErr.message);
    }

    // 9. Success Response
    return res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        id: targetUser.id,
        system_user_id: targetUser.system_user_id,
        name: targetUser.name,
        email: targetUser.email,
        role: normalizeRole(targetUser.role)
      }
    });
  } catch (err) {
    console.error('❌ User deletion error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  changeTempPassword,
  deleteUser
};
