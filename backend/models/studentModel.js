const db = require('../config/db');

const StudentModel = {
  findAll: () =>
    db.prepare('SELECT student_id, roll_number, name, email, phone, department, semester, favorite_bus, created_at FROM students ORDER BY created_at DESC').all(),

  findById: (id) =>
    db.prepare('SELECT student_id, roll_number, name, email, phone, department, semester, favorite_bus, profile_photo, created_at FROM students WHERE student_id = ?').get(id),

  findByEmail: (email) =>
    db.prepare('SELECT * FROM students WHERE email = ?').get(email),

  findByRollNumber: (roll) =>
    db.prepare('SELECT * FROM students WHERE roll_number = ?').get(roll),

  create: (data) =>
    db.prepare(`
      INSERT INTO students (roll_number, name, email, phone, department, semester, password)
      VALUES (@roll_number, @name, @email, @phone, @department, @semester, @password)
    `).run(data),

  update: (id, data) =>
    db.prepare(`
      UPDATE students SET name = @name, email = @email, phone = @phone,
      department = @department, semester = @semester WHERE student_id = @student_id
    `).run({ ...data, student_id: id }),

  delete: (id) =>
    db.prepare('DELETE FROM students WHERE student_id = ?').run(id),

  updatePassword: (id, password) =>
    db.prepare('UPDATE students SET password = ? WHERE student_id = ?').run(password, id),

  updateFavoriteBus: (id, busId) =>
    db.prepare('UPDATE students SET favorite_bus = ? WHERE student_id = ?').run(busId, id),

  search: (query) =>
    db.prepare(`
      SELECT student_id, roll_number, name, email, phone, department, semester, created_at
      FROM students
      WHERE name LIKE ? OR roll_number LIKE ? OR email LIKE ? OR department LIKE ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`),
};

module.exports = StudentModel;
