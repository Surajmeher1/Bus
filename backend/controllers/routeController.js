const RouteModel = require('../models/routeModel');

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
    const { route_name, source, destination, distance, stops } = req.body;
    const result = RouteModel.create({ route_name, source, destination, distance: parseFloat(distance) || 0 });
    const routeId = result.lastInsertRowid;

    if (stops && Array.isArray(stops)) {
      stops.forEach((stop, idx) => {
        RouteModel.addStop({
          route_id: routeId,
          stop_name: stop.stop_name,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude),
          stop_order: stop.stop_order || idx + 1
        });
      });
    }
    res.status(201).json({ success: true, message: 'Route created.', id: routeId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateRoute = (req, res) => {
  try {
    const { route_name, source, destination, distance } = req.body;
    RouteModel.update(req.params.id, { route_name, source, destination, distance });
    res.json({ success: true, message: 'Route updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteRoute = (req, res) => {
  try {
    RouteModel.delete(req.params.id);
    res.json({ success: true, message: 'Route deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addStop = (req, res) => {
  try {
    RouteModel.addStop({ route_id: req.params.id, ...req.body });
    res.status(201).json({ success: true, message: 'Stop added.' });
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

module.exports = { getAllRoutes, getRoute, createRoute, updateRoute, deleteRoute, addStop, deleteStop };
