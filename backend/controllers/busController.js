const BusModel = require('../models/busModel');
const db = require('../config/db');

const getAllBuses = (req, res) => {
  try {
    res.json({ success: true, data: BusModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getBus = (req, res) => {
  try {
    const bus = BusModel.findById(req.params.id);
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });
    res.json({ success: true, data: bus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getManagerBuses = (req, res) => {
  try {
    const buses = BusModel.findByManager(req.user.id);
    res.json({ success: true, data: buses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createBus = (req, res) => {
  try {
    const { bus_number, registration_number, capacity, driver_id, manager_id, route_id } = req.body;
    const result = BusModel.create({
      bus_number, registration_number,
      capacity: parseInt(capacity),
      available_seats: parseInt(capacity),
      driver_id: driver_id || null,
      manager_id: manager_id || null,
      route_id: route_id || null
    });
    req.logActivity?.('BUS_CREATED', `Bus ${bus_number} created [ID: ${result.lastInsertRowid}]`);
    if (driver_id) {
      req.logActivity?.('DRIVER_ASSIGNED', `Driver #${driver_id} assigned to Bus ${bus_number}`);
    }
    res.status(201).json({ success: true, message: 'Bus created.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateBus = (req, res) => {
  try {
    BusModel.update(req.params.id, req.body);
    req.logActivity?.('BUS_UPDATED', `Bus #${req.params.id} updated`);
    if (req.body.driver_id) {
      req.logActivity?.('DRIVER_ASSIGNED', `Driver #${req.body.driver_id} assigned to Bus #${req.params.id}`);
    }
    res.json({ success: true, message: 'Bus updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteBus = (req, res) => {
  try {
    BusModel.delete(req.params.id);
    req.logActivity?.('BUS_DELETED', `Bus #${req.params.id} deleted`);
    res.json({ success: true, message: 'Bus deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


const updateBusLocation = (req, res) => {
  try {
    const { latitude, longitude, speed } = req.body;
    BusModel.updateLocation(req.params.id, latitude, longitude, speed || 0);
    // Emit via socket (attached to req.io by server)
    if (req.io) {
      req.io.to(`bus-${req.params.id}`).emit('bus-location-update', {
        bus_id: parseInt(req.params.id),
        latitude, longitude, speed: speed || 0,
        timestamp: new Date().toISOString()
      });
    }
    res.json({ success: true, message: 'Location updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateBusStatus = (req, res) => {
  try {
    const { status } = req.body;
    BusModel.updateStatus(req.params.id, status);
    if (req.io) {
      req.io.emit('bus-status-change', { bus_id: parseInt(req.params.id), status });
    }
    res.json({ success: true, message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateSeatAvailability = (req, res) => {
  try {
    const { available_seats } = req.body;
    BusModel.updateSeats(req.params.id, available_seats);
    if (req.io) {
      req.io.emit('seat-update', { bus_id: parseInt(req.params.id), available_seats });
    }
    res.json({ success: true, message: 'Seat availability updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAllLocations = (req, res) => {
  try {
    res.json({ success: true, data: BusModel.getLocations() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getFuelRecords = (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM fuel_records WHERE bus_id = ? ORDER BY date DESC').all(req.params.id);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addFuelRecord = (req, res) => {
  try {
    const { date, liters, cost, odometer, notes } = req.body;
    db.prepare('INSERT INTO fuel_records (bus_id, date, liters, cost, odometer, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, date, liters, cost, odometer, notes);
    res.status(201).json({ success: true, message: 'Fuel record added.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMaintenanceRecords = (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM maintenance_records WHERE bus_id = ? ORDER BY date DESC').all(req.params.id);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addMaintenanceRecord = (req, res) => {
  try {
    const { date, description, cost, mechanic, status } = req.body;
    db.prepare('INSERT INTO maintenance_records (bus_id, date, description, cost, mechanic, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, date, description, cost, mechanic, status || 'completed');
    res.status(201).json({ success: true, message: 'Maintenance record added.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllBuses, getBus, getManagerBuses, createBus, updateBus, deleteBus,
  updateBusLocation, updateBusStatus, updateSeatAvailability, getAllLocations,
  getFuelRecords, addFuelRecord, getMaintenanceRecords, addMaintenanceRecord
};
