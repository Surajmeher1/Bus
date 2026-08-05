const db = require('../config/db');

const FeedbackModel = {
  findAll: () =>
    db.prepare(`
      SELECT f.*, s.name as student_name, s.roll_number, b.bus_number
      FROM feedback f
      JOIN students s ON f.student_id = s.student_id
      JOIN buses b    ON f.bus_id     = b.bus_id
      ORDER BY f.created_at DESC
    `).all(),

  findByBus: (busId) =>
    db.prepare(`
      SELECT f.*, s.name as student_name, s.roll_number
      FROM feedback f
      JOIN students s ON f.student_id = s.student_id
      WHERE f.bus_id = ?
      ORDER BY f.created_at DESC
    `).all(busId),

  findByStudent: (studentId) =>
    db.prepare(`
      SELECT f.*, b.bus_number
      FROM feedback f
      JOIN buses b ON f.bus_id = b.bus_id
      WHERE f.student_id = ?
      ORDER BY f.created_at DESC
    `).all(studentId),

  create: (data) =>
    db.prepare(`
      INSERT INTO feedback (student_id, bus_id, message, rating)
      VALUES (@student_id, @bus_id, @message, @rating)
    `).run(data),

  getAverageRating: (busId) =>
    db.prepare('SELECT AVG(rating) as avg, COUNT(*) as total FROM feedback WHERE bus_id = ?').get(busId),
};

module.exports = FeedbackModel;
