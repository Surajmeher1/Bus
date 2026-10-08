const RouteModel = require('../models/routeModel');
const db = require('../config/db');

const getAllRoutes = (req, res) => {
  try {
    res.json({ success: true, data: RouteModel.findAllWithStops() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getRoute = (req, res) => {
  try {
    const route = RouteModel.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    const stops = RouteModel.getStops(req.params.id);
    res.json({ success: true, data: { ...route, stops } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createRoute = (req, res) => {
  try {
    const { route_name, source, destination, distance, direction, destination_type, stops } = req.body;
    if (!route_name || !source || !destination) {
      return res.status(400).json({ success: false, message: 'Route name, source, and destination are required.' });
    }

    const result = RouteModel.create({
      route_name,
      source,
      destination,
      distance: parseFloat(distance) || 0,
      direction: direction || 'towards_campus',
      destination_type: destination_type || 'college'
    });
    const routeId = result.lastInsertRowid;

    if (stops && Array.isArray(stops)) {
      stops.forEach((stop, idx) => {
        RouteModel.addStop({
          route_id: routeId,
          stop_name: stop.stop_name,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude),
          stop_order: stop.stop_order || idx + 1,
          is_college: stop.is_college ? 1 : 0,
          expected_offset_minutes: parseInt(stop.expected_offset_minutes) || 5
        });
      });
    }

    req.logActivity?.('create_route', `Created route '${route_name}'`);
    res.status(201).json({ success: true, message: 'Route created.', id: routeId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateRoute = (req, res) => {
  try {
    const { route_name, source, destination, distance, direction, destination_type } = req.body;
    RouteModel.update(req.params.id, {
      route_name,
      source,
      destination,
      distance: parseFloat(distance) || 0,
      direction,
      destination_type
    });
    req.logActivity?.('update_route', `Updated route ID ${req.params.id}`);
    res.json({ success: true, message: 'Route updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteRoute = (req, res) => {
  try {
    RouteModel.delete(req.params.id);
    req.logActivity?.('delete_route', `Deleted route ID ${req.params.id}`);
    res.json({ success: true, message: 'Route deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addStop = (req, res) => {
  try {
    const { stop_name, latitude, longitude, stop_order, is_college, expected_offset_minutes } = req.body;
    if (!stop_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Stop name, latitude, and longitude are required.' });
    }

    const currentStops = RouteModel.getStops(req.params.id);
    const order = stop_order || (currentStops.length + 1);

    const result = RouteModel.addStop({
      route_id: parseInt(req.params.id),
      stop_name,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      stop_order: order,
      is_college: is_college ? 1 : 0,
      expected_offset_minutes: parseInt(expected_offset_minutes) || 5
    });

    res.status(201).json({ success: true, message: 'Stop added.', stop_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateStop = (req, res) => {
  try {
    const { stop_name, latitude, longitude, stop_order, is_college, expected_offset_minutes } = req.body;
    RouteModel.updateStop(req.params.stopId, {
      stop_name,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      stop_order: parseInt(stop_order),
      is_college: is_college ? 1 : 0,
      expected_offset_minutes: parseInt(expected_offset_minutes) || 5
    });
    res.json({ success: true, message: 'Stop updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteStop = (req, res) => {
  try {
    RouteModel.deleteStop(req.params.stopId);
    res.json({ success: true, message: 'Stop deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const reorderStops = (req, res) => {
  try {
    const { stops } = req.body; // array of { stop_id, stop_order }
    if (!Array.isArray(stops)) {
      return res.status(400).json({ success: false, message: 'Stops array is required.' });
    }
    RouteModel.reorderStops(parseInt(req.params.id), stops);
    res.json({ success: true, message: 'Stops reordered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Assign Route to Bus & Driver
 * Ensures database relationship integrity
 */
const assignRoute = (req, res) => {
  try {
    const routeId = parseInt(req.params.id);
    const { bus_id, driver_id } = req.body;

    if (!bus_id) {
      return res.status(400).json({ success: false, message: 'Bus ID is required.' });
    }

    const bus = db.prepare('SELECT * FROM buses WHERE bus_id = ?').get(bus_id);
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });

    // If driver is provided, verify driver exists and is active
    let driverId = bus.driver_id;
    if (driver_id) {
      const driver = db.prepare('SELECT * FROM drivers WHERE driver_id = ?').get(driver_id);
      if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
      if (!driver.is_active) return res.status(400).json({ success: false, message: 'Driver account is inactive.' });
      driverId = driver.driver_id;
    }

    // Update bus assignment
    db.prepare(`
      UPDATE buses SET route_id = ?, driver_id = COALESCE(?, driver_id) WHERE bus_id = ?
    `).run(routeId, driverId, bus_id);

    req.logActivity?.('assign_route', `Assigned route #${routeId} to bus #${bus.bus_number}`);

    res.json({ success: true, message: `Route assigned to ${bus.bus_number} successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,
  addStop,
  updateStop,
  deleteStop,
  reorderStops,
  assignRoute
};
