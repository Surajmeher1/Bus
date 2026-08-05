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
      INSERT INTO routes (route_name, source, destination, distance)
      VALUES (@route_name, @source, @destination, @distance)
    `).run(data),

  update: (id, data) =>
    db.prepare(`
      UPDATE routes SET route_name = @route_name, source = @source,
      destination = @destination, distance = @distance WHERE route_id = @route_id
    `).run({ ...data, route_id: id }),

  delete: (id) =>
    db.prepare('DELETE FROM routes WHERE route_id = ?').run(id),

  addStop: (data) =>
    db.prepare(`
      INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order)
      VALUES (@route_id, @stop_name, @latitude, @longitude, @stop_order)
    `).run(data),

  deleteStop: (stopId) =>
    db.prepare('DELETE FROM bus_stops WHERE stop_id = ?').run(stopId),

  updateStop: (stopId, data) =>
    db.prepare(`
      UPDATE bus_stops SET stop_name = @stop_name, latitude = @latitude,
      longitude = @longitude, stop_order = @stop_order WHERE stop_id = @stop_id
    `).run({ ...data, stop_id: stopId }),

  findAllWithStops: () => {
    const routes = db.prepare('SELECT * FROM routes ORDER BY route_name').all();
    const stopsStmt = db.prepare('SELECT * FROM bus_stops WHERE route_id = ? ORDER BY stop_order');
    return routes.map(r => ({ ...r, stops: stopsStmt.all(r.route_id) }));
  },
};

module.exports = RouteModel;
