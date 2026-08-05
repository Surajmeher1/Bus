const db = require('../config/db');

const ManagerModel = {
  findAll: () =>
    db.prepare('SELECT manager_id, name, email, phone, created_at FROM managers ORDER BY name').all(),

  findById: (id) =>
    db.prepare('SELECT manager_id, name, email, phone, created_at FROM managers WHERE manager_id = ?').get(id),

  findByEmail: (email) =>
    db.prepare('SELECT * FROM managers WHERE email = ?').get(email),

  create: (data) =>
    db.prepare(`
      INSERT INTO managers (name, email, phone, password)
      VALUES (@name, @email, @phone, @password)
    `).run(data),

  update: (id, data) =>
    db.prepare(`
      UPDATE managers SET name = @name, email = @email, phone = @phone WHERE manager_id = @manager_id
    `).run({ ...data, manager_id: id }),

  delete: (id) =>
    db.prepare('DELETE FROM managers WHERE manager_id = ?').run(id),

  updatePassword: (id, password) =>
    db.prepare('UPDATE managers SET password = ? WHERE manager_id = ?').run(password, id),
};

module.exports = ManagerModel;
