const bcrypt = require('bcryptjs');
const StudentModel = require('../models/studentModel');
const db = require('../config/db');
const { isValidGietEmail, generateSystemUserId } = require('../utils/validation');

const getAllStudents = (req, res) => {
  try {
    const q = req.query.q || req.query.search;
    const students = q ? StudentModel.search(q.trim()) : StudentModel.findAll();
    res.json({ success: true, data: students, count: students.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getStudent = (req, res) => {
  try {
    const student = StudentModel.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getProfile = (req, res) => {
  try {
    const student = StudentModel.findById(req.user.id);
    if (!student) return res.status(404).json({ success: false, message: 'Profile not found.' });
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createStudent = async (req, res) => {
  try {
    const { roll_number, name, email, phone, department, semester, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidGietEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Official university email ending with @giet.edu is required.' });
    }
    if (StudentModel.findByEmail(cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const roll = roll_number ? roll_number.trim().toUpperCase() : `GIET-${Date.now().toString().slice(-6)}`;
    if (StudentModel.findByRollNumber(roll)) {
      return res.status(409).json({ success: false, message: 'Roll number already exists.' });
    }

    const systemUserId = generateSystemUserId('student', db);
    const hashed = await bcrypt.hash(password || 'Student@123', 10);
    const result = db.prepare(`
      INSERT INTO students (roll_number, name, email, phone, department, semester, password, system_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(roll, name.trim(), cleanEmail, phone || null, department || null, semester ? parseInt(semester) : 1, hashed, systemUserId);

    req.logActivity?.('STUDENT_CREATED', `Student ${name} (${roll}) created with ID ${systemUserId}`);
    res.status(201).json({ success: true, message: 'Student created.', id: result.lastInsertRowid, system_user_id: systemUserId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateStudent = async (req, res) => {
  try {
    const id = req.params.id || req.user?.id;
    const student = StudentModel.findById(id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const { name, email, phone, department, semester } = req.body;
    let cleanEmail = undefined;
    if (email) {
      cleanEmail = email.trim().toLowerCase();
      if (!isValidGietEmail(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Official university email ending with @giet.edu is required.' });
      }
      const existing = StudentModel.findByEmail(cleanEmail);
      if (existing && existing.student_id !== parseInt(id)) {
        return res.status(409).json({ success: false, message: 'Email already exists.' });
      }
    }

    db.prepare(`
      UPDATE students SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        department = COALESCE(?, department),
        semester = COALESCE(?, semester)
      WHERE student_id = ?
    `).run(
      name ? name.trim() : null,
      cleanEmail || null,
      phone || null,
      department || null,
      semester ? parseInt(semester) : null,
      id
    );

    req.logActivity?.('STUDENT_UPDATED', `Student #${id} updated`);
    res.json({ success: true, message: 'Student updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteStudent = (req, res) => {
  try {
    const student = StudentModel.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    // Clean up foreign key references before deleting
    db.prepare('DELETE FROM feedback WHERE student_id = ?').run(req.params.id);

    StudentModel.delete(req.params.id);
    req.logActivity?.('STUDENT_DELETED', `Student #${req.params.id} (${student.name}) deleted`);
    res.json({ success: true, message: 'Student deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const student = StudentModel.findByEmail(req.user.email);
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(current_password, student.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(new_password, 10);
    StudentModel.updatePassword(req.user.id, hashed);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const setFavoriteBus = (req, res) => {
  try {
    const { bus_id } = req.body;
    StudentModel.updateFavoriteBus(req.user.id, bus_id);
    res.json({ success: true, message: 'Favorite bus updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const searchStudents = (req, res) => {
  try {
    const { q } = req.query;
    const results = StudentModel.search(q || '');
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllStudents, getStudent, getProfile, createStudent,
  updateStudent, deleteStudent, changePassword, setFavoriteBus, searchStudents
};
