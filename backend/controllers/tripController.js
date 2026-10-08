const TripModel = require('../models/tripModel');
const BusModel = require('../models/busModel');

const getAllTrips = (req, res) => {
  try {
    res.json({ success: true, data: TripModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTodayTrips = (req, res) => {
  try {
    res.json({ success: true, data: TripModel.findToday() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const startTrip = (req, res) => {
  try {
    const { bus_id, driver_id, route_id } = req.body;
    const result = TripModel.create({ bus_id, driver_id, route_id });
    BusModel.updateStatus(bus_id, 'running');
    if (req.io) {
      req.io.emit('bus-status-change', { bus_id: parseInt(bus_id), status: 'running' });
    }
    req.logActivity?.('TRIP_STARTED', `Trip #${result.lastInsertRowid} started for bus #${bus_id}`);
    res.status(201).json({ success: true, message: 'Trip started.', trip_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const endTrip = (req, res) => {
  try {
    const trip = TripModel.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    TripModel.endTrip(req.params.id);
    BusModel.updateStatus(trip.bus_id, 'inactive');
    if (req.io) {
      req.io.emit('bus-status-change', { bus_id: trip.bus_id, status: 'inactive' });
    }
    req.logActivity?.('TRIP_COMPLETED', `Trip #${req.params.id} ended on bus #${trip.bus_id}`);
    res.json({ success: true, message: 'Trip ended.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


const getTripHistory = (req, res) => {
  try {
    const history = TripModel.getHistory(req.params.busId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllTrips, getTodayTrips, startTrip, endTrip, getTripHistory };
