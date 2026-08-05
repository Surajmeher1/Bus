const bcrypt = require('bcryptjs');
const StudentModel = require('../models/studentModel');

const getAllStudents = (req, res) => {
  try {
    const students = StudentModel.findAll();
    res.json({ success: true, data: students });
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
    if (StudentModel.findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const hashed = await bcrypt.hash(password || 'Student@123', 10);
    const result = StudentModel.create({ roll_number, name, email, phone, department, semester, password: hashed });
    res.status(201).json({ success: true, message: 'Student created.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateStudent = (req, res) => {
  try {
    const { name, email, phone, department, semester } = req.body;
    const id = req.params.id || req.user.id;
    StudentModel.update(id, { name, email, phone, department, semester });
    res.json({ success: true, message: 'Student updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteStudent = (req, res) => {
  try {
    StudentModel.delete(req.params.id);
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
