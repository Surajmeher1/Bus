const bcrypt = require('bcryptjs');
const ManagerModel = require('../models/managerModel');
const db = require('../config/db');
const { isValidGietEmail, generateSystemUserId } = require('../utils/validation');

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
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidGietEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Official university email ending with @giet.edu is required.' });
    }
    if (ManagerModel.findByEmail(cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }

    const systemUserId = generateSystemUserId('manager', db);
    const hashed = await bcrypt.hash(password || 'Manager@123', 10);
    const result = db.prepare(`
      INSERT INTO managers (name, email, phone, password, system_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), cleanEmail, phone || null, hashed, systemUserId);

    req.logActivity?.('MANAGER_CREATED', `Manager ${name} created with ID ${systemUserId}`);
    res.status(201).json({ success: true, message: 'Manager created.', id: result.lastInsertRowid, system_user_id: systemUserId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateManager = async (req, res) => {
  try {
    const manager = ManagerModel.findById(req.params.id);
    if (!manager) return res.status(404).json({ success: false, message: 'Manager not found.' });

    const { name, email, phone, password } = req.body;
    let cleanEmail = undefined;
    if (email) {
      cleanEmail = email.trim().toLowerCase();
      if (!isValidGietEmail(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Official university email ending with @giet.edu is required.' });
      }
      const existing = ManagerModel.findByEmail(cleanEmail);
      if (existing && existing.manager_id !== parseInt(req.params.id)) {
        return res.status(409).json({ success: false, message: 'Email already exists.' });
      }
    }

    let hashedPwd = undefined;
    if (password) hashedPwd = await bcrypt.hash(password, 10);

    db.prepare(`
      UPDATE managers SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone)
        ${hashedPwd ? ', password = ?' : ''}
      WHERE manager_id = ?
    `).run(
      name || null,
      cleanEmail || null,
      phone || null,
      ...(hashedPwd ? [hashedPwd] : []),
      req.params.id
    );

    req.logActivity?.('MANAGER_UPDATED', `Manager #${req.params.id} updated`);
    res.json({ success: true, message: 'Manager updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteManager = (req, res) => {
  try {
    const manager = ManagerModel.findById(req.params.id);
    if (!manager) return res.status(404).json({ success: false, message: 'Manager not found.' });

    // Safely unassign buses before deleting manager
    db.prepare('UPDATE buses SET manager_id = NULL WHERE manager_id = ?').run(req.params.id);

    ManagerModel.delete(req.params.id);
    req.logActivity?.('MANAGER_DELETED', `Manager #${req.params.id} (${manager.name}) deleted`);
    res.json({ success: true, message: 'Manager deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllManagers, getManager, createManager, updateManager, deleteManager };

