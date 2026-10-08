const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const AdminModel   = require('../models/adminModel');
const StudentModel = require('../models/studentModel');
const ManagerModel = require('../models/managerModel');
const db = require('../config/db');
const { isValidGietEmail, generateSystemUserId } = require('../utils/validation');
const { ROLES } = require('../utils/roles');

const generateToken = (payload) =>
  jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });

// ── ADMIN LOGIN ──────────────────────────────────────────────────────────────
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = AdminModel.findByUsername(username);
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = generateToken({
      id: admin.admin_id,
      role: ROLES.ADMIN,
      username: admin.username,
      must_change_password: !!admin.must_change_password
    });
    req.logActivity?.('admin_login', `Admin ${username} logged in`);
    res.json({
      success: true,
      token,
      user: {
        id: admin.admin_id,
        username: admin.username,
        email: admin.email,
        role: ROLES.ADMIN,
        system_user_id: admin.system_user_id || 'GIET-ADM-0001',
        must_change_password: !!admin.must_change_password
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── DRIVER LOGIN ─────────────────────────────────────────────────────────────
const driverLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email or User ID and password are required.' });
    }

    const cleanInput = email.trim();
    // Allow login by email or system_user_id
    const driver = db.prepare(`
      SELECT * FROM drivers
      WHERE email = ? OR system_user_id = ?
    `).get(cleanInput, cleanInput);

    if (!driver) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    if (!driver.is_active) {
      return res.status(403).json({ success: false, message: 'Account disabled. Contact admin.' });
    }
    if (!driver.password) {
      return res.status(401).json({ success: false, message: 'Driver login not configured. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, driver.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    // Get assigned bus
    const assignedBus = db.prepare(`
      SELECT b.bus_id, b.bus_number, b.registration_number, b.status, b.route_id,
             b.capacity, b.available_seats, r.route_name, r.source, r.destination
      FROM buses b
      LEFT JOIN routes r ON b.route_id = r.route_id
      WHERE b.driver_id = ?
    `).get(driver.driver_id);

    const token = generateToken({
      id: driver.driver_id,
      role: ROLES.DRIVER,
      email: driver.email,
      must_change_password: !!driver.must_change_password
    });
    req.logActivity?.('driver_login', `Driver ${driver.name} logged in`);

    res.json({
      success: true,
      token,
      user: {
        id: driver.driver_id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        license_number: driver.license_number,
        role: ROLES.DRIVER,
        system_user_id: driver.system_user_id,
        must_change_password: !!driver.must_change_password,
        assigned_bus: assignedBus || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── MANAGER LOGIN ────────────────────────────────────────────────────────────
const managerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanInput = email ? email.trim() : '';
    const manager = db.prepare(`
      SELECT * FROM managers
      WHERE email = ? OR system_user_id = ?
    `).get(cleanInput, cleanInput);

    if (!manager) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, manager.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = generateToken({
      id: manager.manager_id,
      role: ROLES.MANAGER,
      email: manager.email,
      must_change_password: !!manager.must_change_password
    });
    res.json({
      success: true,
      token,
      user: {
        id: manager.manager_id,
        name: manager.name,
        email: manager.email,
        phone: manager.phone,
        role: ROLES.MANAGER,
        system_user_id: manager.system_user_id,
        must_change_password: !!manager.must_change_password
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── STUDENT REGISTER ─────────────────────────────────────────────────────────
const studentRegister = async (req, res) => {
  try {
    const { roll_number, name, email, phone, department, semester, password } = req.body;

    // Strict @giet.edu validation
    if (!email || !isValidGietEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Registration restricted: Only emails ending strictly with @giet.edu are allowed.'
      });
    }

    if (StudentModel.findByEmail(email.trim().toLowerCase())) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    if (StudentModel.findByRollNumber(roll_number)) {
      return res.status(409).json({ success: false, message: 'Roll number already registered.' });
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    const systemUserId = generateSystemUserId('student', db);
    const result = db.prepare(`
      INSERT INTO students (system_user_id, roll_number, name, email, phone, department, semester, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(systemUserId, roll_number, name, email.trim().toLowerCase(), phone, department, parseInt(semester) || 1, hashedPwd);

    const student = StudentModel.findById(result.lastInsertRowid);
    const token = generateToken({ id: student.student_id, role: ROLES.STUDENT, email: student.email, must_change_password: false });

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { ...student, role: ROLES.STUDENT, system_user_id: systemUserId, must_change_password: false }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── STUDENT LOGIN ─────────────────────────────────────────────────────────────
const studentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanInput = email ? email.trim() : '';

    // Allow login by email or system_user_id or roll_number
    const student = db.prepare(`
      SELECT * FROM students
      WHERE email = ? OR system_user_id = ? OR roll_number = ?
    `).get(cleanInput, cleanInput, cleanInput);

    if (!student) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, student.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = generateToken({
      id: student.student_id,
      role: ROLES.STUDENT,
      email: student.email,
      must_change_password: !!student.must_change_password
    });
    const { password: _pwd, ...safeStudent } = student;
    res.json({
      success: true,
      token,
      user: {
        ...safeStudent,
        role: ROLES.STUDENT,
        system_user_id: student.system_user_id,
        must_change_password: !!student.must_change_password
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── UNIFIED RBAC LOGIN (Auto-detects role across Admin, Manager, Driver, Student) ─
const unifiedLogin = async (req, res) => {
  try {
    const rawIdentifier = req.body.identifier || req.body.email || req.body.username;
    const password = req.body.password;

    if (!rawIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'University ID, email, or username and password are required.'
      });
    }

    const cleanInput = rawIdentifier.trim();
    const cleanLower = cleanInput.toLowerCase();

    // 1. Check ADMIN (by username, email, or system_user_id)
    const admin = db.prepare(`
      SELECT * FROM admins
      WHERE LOWER(username) = ? OR LOWER(email) = ? OR system_user_id = ?
    `).get(cleanLower, cleanLower, cleanInput);

    if (admin) {
      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

      const token = generateToken({
        id: admin.admin_id,
        role: ROLES.ADMIN,
        username: admin.username,
        must_change_password: !!admin.must_change_password
      });
      req.logActivity?.('admin_login', `Admin ${admin.username} logged in via unified portal`);

      return res.json({
        success: true,
        token,
        user: {
          id: admin.admin_id,
          username: admin.username,
          email: admin.email,
          role: ROLES.ADMIN,
          system_user_id: admin.system_user_id || 'GIET-ADM-0001',
          must_change_password: !!admin.must_change_password
        }
      });
    }

    // 2. Check MANAGER (by email or system_user_id)
    const manager = db.prepare(`
      SELECT * FROM managers
      WHERE LOWER(email) = ? OR system_user_id = ?
    `).get(cleanLower, cleanInput);

    if (manager) {
      const valid = await bcrypt.compare(password, manager.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

      const token = generateToken({
        id: manager.manager_id,
        role: ROLES.MANAGER,
        email: manager.email,
        must_change_password: !!manager.must_change_password
      });
      req.logActivity?.('manager_login', `Manager ${manager.name} logged in via unified portal`);

      return res.json({
        success: true,
        token,
        user: {
          id: manager.manager_id,
          name: manager.name,
          email: manager.email,
          phone: manager.phone,
          role: ROLES.MANAGER,
          system_user_id: manager.system_user_id,
          must_change_password: !!manager.must_change_password
        }
      });
    }

    // 3. Check DRIVER (by email, system_user_id, or phone)
    const driver = db.prepare(`
      SELECT * FROM drivers
      WHERE LOWER(email) = ? OR system_user_id = ? OR phone = ?
    `).get(cleanLower, cleanInput, cleanInput);

    if (driver) {
      if (!driver.is_active) {
        return res.status(403).json({ success: false, message: 'Driver account is disabled. Contact your administrator.' });
      }
      if (!driver.password) {
        return res.status(401).json({ success: false, message: 'Driver login not configured. Contact your administrator.' });
      }

      const valid = await bcrypt.compare(password, driver.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

      const assignedBus = db.prepare(`
        SELECT b.bus_id, b.bus_number, b.registration_number, b.status, b.route_id,
               b.capacity, b.available_seats, r.route_name, r.source, r.destination
        FROM buses b
        LEFT JOIN routes r ON b.route_id = r.route_id
        WHERE b.driver_id = ?
      `).get(driver.driver_id);

      const token = generateToken({
        id: driver.driver_id,
        role: ROLES.DRIVER,
        email: driver.email,
        must_change_password: !!driver.must_change_password
      });
      req.logActivity?.('driver_login', `Driver ${driver.name} logged in via unified portal`);

      return res.json({
        success: true,
        token,
        user: {
          id: driver.driver_id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          license_number: driver.license_number,
          role: ROLES.DRIVER,
          system_user_id: driver.system_user_id,
          must_change_password: !!driver.must_change_password,
          assigned_bus: assignedBus || null
        }
      });
    }

    // 4. Check STUDENT (by email, system_user_id, or roll_number)
    const student = db.prepare(`
      SELECT * FROM students
      WHERE LOWER(email) = ? OR system_user_id = ? OR roll_number = ?
    `).get(cleanLower, cleanInput, cleanInput);

    if (student) {
      const valid = await bcrypt.compare(password, student.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

      const token = generateToken({
        id: student.student_id,
        role: ROLES.STUDENT,
        email: student.email,
        must_change_password: !!student.must_change_password
      });
      const { password: _pwd, ...safeStudent } = student;
      req.logActivity?.('student_login', `Student ${student.name} logged in via unified portal`);

      return res.json({
        success: true,
        token,
        user: {
          ...safeStudent,
          role: ROLES.STUDENT,
          system_user_id: student.system_user_id,
          must_change_password: !!student.must_change_password
        }
      });
    }

    // If none of the 4 roles matched
    return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── GET CURRENT USER ──────────────────────────────────────────────────────────
const getMe = (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { adminLogin, driverLogin, managerLogin, studentRegister, studentLogin, unifiedLogin, getMe };
