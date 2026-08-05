const db = require('../config/db');

const AdminModel = {
  findByUsername: (username) =>
    db.prepare('SELECT * FROM admins WHERE username = ?').get(username),

  findById: (id) =>
    db.prepare('SELECT admin_id, username, email, created_at FROM admins WHERE admin_id = ?').get(id),

  updatePassword: (id, password) =>
    db.prepare('UPDATE admins SET password = ? WHERE admin_id = ?').run(password, id),

  getStats: () => {
    const totalStudents  = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    const totalBuses     = db.prepare('SELECT COUNT(*) as c FROM buses').get().c;
    const activeBuses    = db.prepare("SELECT COUNT(*) as c FROM buses WHERE status = 'running'").get().c;
    const delayedBuses   = db.prepare("SELECT COUNT(*) as c FROM buses WHERE status = 'delayed'").get().c;
    const totalDrivers   = db.prepare('SELECT COUNT(*) as c FROM drivers').get().c;
    const totalManagers  = db.prepare('SELECT COUNT(*) as c FROM managers').get().c;
    const totalRoutes    = db.prepare('SELECT COUNT(*) as c FROM routes').get().c;
    const activeTrips    = db.prepare("SELECT COUNT(*) as c FROM trips WHERE status = 'running'").get().c;
    const totalFeedback  = db.prepare('SELECT COUNT(*) as c FROM feedback').get().c;
    const avgRating      = db.prepare('SELECT AVG(rating) as avg FROM feedback').get().avg;
    return {
      totalStudents, totalBuses, activeBuses, delayedBuses,
      totalDrivers, totalManagers, totalRoutes, activeTrips,
      totalFeedback, avgRating: avgRating ? avgRating.toFixed(1) : 0
    };
  },

  getActivityLogs: (limit = 50) =>
    db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit),
};

module.exports = AdminModel;
