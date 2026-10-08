const db = require('../config/db');

const RouteModel = {
  findAll: () =>
    db.prepare('SELECT * FROM routes ORDER BY route_name').all(),

  findById: (id) =>
    db.prepare('SELECT * FROM routes WHERE route_id = ?').get(id),

  getStops: (routeId) =>
    db.prepare('SELECT * FROM bus_stops WHERE route_id = ? ORDER BY stop_order').all(routeId),

  create: (data) =>
    db.prepare(`
      INSERT INTO routes (route_name, source, destination, distance, direction, destination_type)
      VALUES (@route_name, @source, @destination, @distance,
              COALESCE(@direction, 'towards_campus'), COALESCE(@destination_type, 'college'))
    `).run(data),

  update: (id, data) =>
    db.prepare(`
      UPDATE routes SET
        route_name = @route_name,
        source = @source,
        destination = @destination,
        distance = @distance,
        direction = COALESCE(@direction, direction),
        destination_type = COALESCE(@destination_type, destination_type)
      WHERE route_id = @route_id
    `).run({ ...data, route_id: id }),

  delete: (id) => {
    // Unassign routes from buses first to prevent broken foreign keys
    db.prepare('UPDATE buses SET route_id = NULL WHERE route_id = ?').run(id);
    db.prepare('DELETE FROM bus_stops WHERE route_id = ?').run(id);
    return db.prepare('DELETE FROM routes WHERE route_id = ?').run(id);
  },

  addStop: (data) =>
    db.prepare(`
      INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order, is_college, expected_offset_minutes)
      VALUES (@route_id, @stop_name, @latitude, @longitude, @stop_order,
              COALESCE(@is_college, 0), COALESCE(@expected_offset_minutes, 5))
    `).run(data),

  deleteStop: (stopId) =>
    db.prepare('DELETE FROM bus_stops WHERE stop_id = ?').run(stopId),

  updateStop: (stopId, data) =>
    db.prepare(`
      UPDATE bus_stops SET
        stop_name = @stop_name,
        latitude = @latitude,
        longitude = @longitude,
        stop_order = @stop_order,
        is_college = COALESCE(@is_college, is_college),
        expected_offset_minutes = COALESCE(@expected_offset_minutes, expected_offset_minutes)
      WHERE stop_id = @stop_id
    `).run({ ...data, stop_id: stopId }),

  reorderStops: (routeId, stopOrders) => {
    const stmt = db.prepare('UPDATE bus_stops SET stop_order = ? WHERE stop_id = ? AND route_id = ?');
    (stopOrders || []).forEach((item, index) => {
      const stopId = (typeof item === 'object' && item !== null) ? item.stop_id : item;
      const order = (typeof item === 'object' && item !== null && item.stop_order !== undefined)
        ? item.stop_order
        : (index + 1);
      stmt.run(order, stopId, routeId);
    });
  },

  findAllWithStops: () => {
    const routes = db.prepare('SELECT * FROM routes ORDER BY route_name').all();
    const stopsStmt = db.prepare('SELECT * FROM bus_stops WHERE route_id = ? ORDER BY stop_order');
    return routes.map(r => ({ ...r, stops: stopsStmt.all(r.route_id) }));
  },
};

module.exports = RouteModel;
