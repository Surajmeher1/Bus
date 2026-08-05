const bcrypt = require('bcryptjs');
const AdminModel = require('../models/adminModel');
const db = require('../config/db');

const getDashboardStats = (req, res) => {
  try {
    const stats = AdminModel.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getReports = (req, res) => {
  try {
    const busUtilization = db.prepare(`
      SELECT b.bus_number, b.capacity, b.available_seats,
             ROUND(((b.capacity - b.available_seats) * 100.0 / b.capacity), 1) as occupancy_percent,
             b.status, COUNT(t.trip_id) as total_trips
      FROM buses b
      LEFT JOIN trips t ON b.bus_id = t.bus_id
      GROUP BY b.bus_id ORDER BY total_trips DESC
    `).all();

    const delayReport = db.prepare(`
      SELECT b.bus_number, COUNT(*) as delay_count
      FROM buses b
      WHERE b.status = 'delayed'
      GROUP BY b.bus_id
    `).all();

    const routeStats = db.prepare(`
      SELECT r.route_name, COUNT(t.trip_id) as trip_count, COUNT(DISTINCT t.bus_id) as buses_assigned
      FROM routes r
      LEFT JOIN trips t ON r.route_id = t.route_id
      GROUP BY r.route_id ORDER BY trip_count DESC
    `).all();

    const studentsByDept = db.prepare(`
      SELECT department, COUNT(*) as count FROM students GROUP BY department ORDER BY count DESC
    `).all();

    const recentActivity = AdminModel.getActivityLogs(20);

    const tripsByStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM trips GROUP BY status
    `).all();

    res.json({
      success: true,
      data: { busUtilization, delayReport, routeStats, studentsByDept, recentActivity, tripsByStatus }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changeAdminPassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const admin = db.prepare('SELECT * FROM admins WHERE admin_id = ?').get(req.user.id);
    const valid = await bcrypt.compare(current_password, admin.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(new_password, 10);
    AdminModel.updatePassword(req.user.id, hashed);
    res.json({ success: true, message: 'Password changed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getActivityLogs = (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ success: true, data: AdminModel.getActivityLogs(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDashboardStats, getReports, changeAdminPassword, getActivityLogs };
