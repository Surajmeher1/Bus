const db = require('../config/db');

const DriverModel = {
  findAll: () =>
    db.prepare('SELECT * FROM drivers ORDER BY name').all(),

  findById: (id) =>
    db.prepare('SELECT * FROM drivers WHERE driver_id = ?').get(id),

  findAvailable: () =>
    db.prepare(`
      SELECT d.* FROM drivers d
      WHERE d.driver_id NOT IN (SELECT driver_id FROM buses WHERE driver_id IS NOT NULL)
    `).all(),

  create: (data) =>
    db.prepare(`
      INSERT INTO drivers (name, phone, license_number, address)
      VALUES (@name, @phone, @license_number, @address)
    `).run(data),

  update: (id, data) =>
    db.prepare(`
      UPDATE drivers SET name = @name, phone = @phone, license_number = @license_number, address = @address
      WHERE driver_id = @driver_id
    `).run({ ...data, driver_id: id }),

  delete: (id) =>
    db.prepare('DELETE FROM drivers WHERE driver_id = ?').run(id),
};

module.exports = DriverModel;
