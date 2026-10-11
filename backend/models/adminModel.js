const db = require('../config/db');

const AdminModel = {
  findByUsername: (username) =>
    db.prepare('SELECT * FROM admins WHERE username = ?').get(username),

  findById: (id) =>
    db.prepare('SELECT admin_id, username, email, created_at FROM admins WHERE admin_id = ?').get(id),

  updatePassword: (id, password) =>
    db.prepare('UPDATE admins SET password = ? WHERE admin_id = ?').run(password, id),

  getStats: () => {
    const getCount = (query) => {
      try {
        const row = db.prepare(query).get();
        return row && row.c != null ? Number(row.c) : 0;
      } catch (_) {
        return 0;
      }
    };

    const totalStudents  = getCount('SELECT COUNT(*) as c FROM students');
    const totalBuses     = getCount('SELECT COUNT(*) as c FROM buses');
    const activeBuses    = getCount("SELECT COUNT(*) as c FROM buses WHERE status = 'running'");
    const delayedBuses   = getCount("SELECT COUNT(*) as c FROM buses WHERE status = 'delayed'");
    const totalDrivers   = getCount('SELECT COUNT(*) as c FROM drivers');
    const totalManagers  = getCount('SELECT COUNT(*) as c FROM managers');
    const totalRoutes    = getCount('SELECT COUNT(*) as c FROM routes');
    const activeTrips    = getCount("SELECT COUNT(*) as c FROM trips WHERE status = 'running'");
    const totalFeedback  = getCount('SELECT COUNT(*) as c FROM feedback');

    let avgRating = 0;
    try {
      const avgRow = db.prepare('SELECT AVG(rating) as avg FROM feedback').get();
      if (avgRow && avgRow.avg != null) {
        avgRating = Number(Number(avgRow.avg).toFixed(1));
      }
    } catch (_) {
      avgRating = 0;
    }

    return {
      totalStudents, totalBuses, activeBuses, delayedBuses,
      totalDrivers, totalManagers, totalRoutes, activeTrips,
      totalFeedback, avgRating
    };
  },

  getActivityLogs: (limit = 50) =>
    db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit),
};

module.exports = AdminModel;
