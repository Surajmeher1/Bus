const bcrypt = require('bcryptjs');
const ManagerModel = require('../models/managerModel');

const getAllManagers = (req, res) => {
  try {
    res.json({ success: true, data: ManagerModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getManager = (req, res) => {
  try {
    const manager = ManagerModel.findById(req.params.id);
    if (!manager) return res.status(404).json({ success: false, message: 'Manager not found.' });
    res.json({ success: true, data: manager });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createManager = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (ManagerModel.findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const hashed = await bcrypt.hash(password || 'Manager@123', 10);
    const result = ManagerModel.create({ name, email, phone, password: hashed });
    res.status(201).json({ success: true, message: 'Manager created.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateManager = (req, res) => {
  try {
    ManagerModel.update(req.params.id, req.body);
    res.json({ success: true, message: 'Manager updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteManager = (req, res) => {
  try {
    ManagerModel.delete(req.params.id);
    res.json({ success: true, message: 'Manager deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllManagers, getManager, createManager, updateManager, deleteManager };
