const db = require('../config/db');

const BusModel = {
  findAll: () =>
    db.prepare(`
      SELECT b.*, d.name as driver_name, d.phone as driver_phone,
             m.name as manager_name, r.route_name
      FROM buses b
      LEFT JOIN drivers d  ON b.driver_id  = d.driver_id
      LEFT JOIN managers m ON b.manager_id = m.manager_id
      LEFT JOIN routes r   ON b.route_id   = r.route_id
      ORDER BY b.bus_number
    `).all(),

  findById: (id) =>
    db.prepare(`
      SELECT b.*, d.name as driver_name, d.phone as driver_phone, d.license_number,
             m.name as manager_name, m.phone as manager_phone,
             r.route_name, r.source, r.destination, r.distance
      FROM buses b
      LEFT JOIN drivers d  ON b.driver_id  = d.driver_id
      LEFT JOIN managers m ON b.manager_id = m.manager_id
      LEFT JOIN routes r   ON b.route_id   = r.route_id
      WHERE b.bus_id = ?
    `).get(id),

  findByManager: (managerId) =>
    db.prepare(`
      SELECT b.*, d.name as driver_name, r.route_name
      FROM buses b
      LEFT JOIN drivers d ON b.driver_id = d.driver_id
      LEFT JOIN routes r  ON b.route_id  = r.route_id
      WHERE b.manager_id = ?
    `).all(managerId),

  create: (data) =>
    db.prepare(`
      INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id)
      VALUES (@bus_number, @registration_number, @capacity, @available_seats, @driver_id, @manager_id, @route_id)
    `).run(data),

  update: (id, data) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    return db.prepare(`UPDATE buses SET ${fields} WHERE bus_id = @bus_id`).run({ ...data, bus_id: id });
  },

  delete: (id) =>
    db.prepare('DELETE FROM buses WHERE bus_id = ?').run(id),

  updateLocation: (id, lat, lng, speed = 0) =>
    db.prepare(`
      UPDATE buses SET current_latitude = ?, current_longitude = ?, current_speed = ? WHERE bus_id = ?
    `).run(lat, lng, speed, id),

  updateStatus: (id, status) =>
    db.prepare('UPDATE buses SET status = ? WHERE bus_id = ?').run(status, id),

  updateSeats: (id, seats) =>
    db.prepare('UPDATE buses SET available_seats = ? WHERE bus_id = ?').run(seats, id),

  getLocations: () =>
    db.prepare(`
      SELECT b.bus_id, b.bus_number, b.registration_number, b.current_latitude, b.current_longitude,
             b.current_speed, b.status, b.tracking_status, b.trip_state, b.available_seats,
             b.capacity, b.route_id, r.route_name, d.name as driver_name, d.phone as driver_phone
      FROM buses b
      LEFT JOIN routes r ON b.route_id = r.route_id
      LEFT JOIN drivers d ON b.driver_id = d.driver_id
      WHERE b.status != 'inactive'
    `).all(),
};

module.exports = BusModel;
