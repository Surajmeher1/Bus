const db = require('../config/db');

const TripModel = {
  findAll: () =>
    db.prepare(`
      SELECT t.*, b.bus_number, d.name as driver_name, r.route_name
      FROM trips t
      LEFT JOIN buses b   ON t.bus_id    = b.bus_id
      LEFT JOIN drivers d ON t.driver_id = d.driver_id
      LEFT JOIN routes r  ON t.route_id  = r.route_id
      ORDER BY t.created_at DESC
    `).all(),

  findById: (id) =>
    db.prepare(`
      SELECT t.*, b.bus_number, d.name as driver_name, r.route_name
      FROM trips t
      LEFT JOIN buses b   ON t.bus_id    = b.bus_id
      LEFT JOIN drivers d ON t.driver_id = d.driver_id
      LEFT JOIN routes r  ON t.route_id  = r.route_id
      WHERE t.trip_id = ?
    `).get(id),

  findToday: () =>
    db.prepare(`
      SELECT t.*, b.bus_number, b.status as bus_status, d.name as driver_name, r.route_name,
             b.available_seats, b.capacity
      FROM trips t
      LEFT JOIN buses b   ON t.bus_id    = b.bus_id
      LEFT JOIN drivers d ON t.driver_id = d.driver_id
      LEFT JOIN routes r  ON t.route_id  = r.route_id
      WHERE date(t.created_at) = date('now')
      ORDER BY t.start_time DESC
    `).all(),

  findActiveByManager: (managerId) =>
    db.prepare(`
      SELECT t.*, b.bus_number, d.name as driver_name, r.route_name
      FROM trips t
      JOIN buses b ON t.bus_id = b.bus_id
      LEFT JOIN drivers d ON t.driver_id = d.driver_id
      LEFT JOIN routes r  ON t.route_id  = r.route_id
      WHERE b.manager_id = ? AND t.status = 'running'
    `).all(managerId),

  create: (data) =>
    db.prepare(`
      INSERT INTO trips (bus_id, driver_id, route_id, start_time, status)
      VALUES (@bus_id, @driver_id, @route_id, datetime('now'), 'running')
    `).run(data),

  startTrip: (id) =>
    db.prepare("UPDATE trips SET status = 'running', start_time = datetime('now') WHERE trip_id = ?").run(id),

  endTrip: (id) =>
    db.prepare("UPDATE trips SET status = 'completed', end_time = datetime('now') WHERE trip_id = ?").run(id),

  cancelTrip: (id) =>
    db.prepare("UPDATE trips SET status = 'cancelled' WHERE trip_id = ?").run(id),

  getHistory: (busId, limit = 20) =>
    db.prepare(`
      SELECT t.*, r.route_name FROM trips t
      LEFT JOIN routes r ON t.route_id = r.route_id
      WHERE t.bus_id = ? ORDER BY t.created_at DESC LIMIT ?
    `).all(busId, limit),
};

module.exports = TripModel;
