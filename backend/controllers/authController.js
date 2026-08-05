const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const AdminModel   = require('../models/adminModel');
const StudentModel = require('../models/studentModel');
const ManagerModel = require('../models/managerModel');

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

    const token = generateToken({ id: admin.admin_id, role: 'admin', username: admin.username });
    req.logActivity?.('admin_login', `Admin ${username} logged in`);
    res.json({
      success: true,
      token,
      user: { id: admin.admin_id, username: admin.username, email: admin.email, role: 'admin' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── MANAGER LOGIN ────────────────────────────────────────────────────────────
const managerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = ManagerModel.findByEmail(email);
    if (!manager) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, manager.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = generateToken({ id: manager.manager_id, role: 'manager', email: manager.email });
    res.json({
      success: true,
      token,
      user: { id: manager.manager_id, name: manager.name, email: manager.email, phone: manager.phone, role: 'manager' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── STUDENT REGISTER ─────────────────────────────────────────────────────────
const studentRegister = async (req, res) => {
  try {
    const { roll_number, name, email, phone, department, semester, password } = req.body;

    if (StudentModel.findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    if (StudentModel.findByRollNumber(roll_number)) {
      return res.status(409).json({ success: false, message: 'Roll number already registered.' });
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    const result = StudentModel.create({ roll_number, name, email, phone, department, semester: parseInt(semester), password: hashedPwd });
    const student = StudentModel.findById(result.lastInsertRowid);
    const token = generateToken({ id: student.student_id, role: 'student', email: student.email });

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { ...student, role: 'student' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── STUDENT LOGIN ─────────────────────────────────────────────────────────────
const studentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = StudentModel.findByEmail(email);
    if (!student) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, student.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = generateToken({ id: student.student_id, role: 'student', email: student.email });
    const { password: _pwd, ...safeStudent } = student;
    res.json({
      success: true,
      token,
      user: { ...safeStudent, role: 'student' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
};

// ── GET CURRENT USER ──────────────────────────────────────────────────────────
const getMe = (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { adminLogin, managerLogin, studentRegister, studentLogin, getMe };
